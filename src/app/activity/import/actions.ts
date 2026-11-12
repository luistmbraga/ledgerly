"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { listAssets } from "@/db/repositories/assets";
import { listCategories } from "@/db/repositories/categories";
import {
  ImportRowError,
  confirmImport,
  findBatchesByFileHash,
  frozenEntryKeys,
  getImportContext,
  undoImport,
} from "@/db/repositories/imports";
import { getLatestSnapshot } from "@/db/repositories/snapshots";
import { flagCandidates, type ImportFlag } from "@/domain/import-dedupe";
import { resolveImportedAmount } from "@/domain/import-fee";
import { isLinkMode, planCashLinks, type LinkMode, type LinkPlan } from "@/domain/import-links";
import { buildRecurringReconciles, resolveRecurringUpdates } from "@/domain/import-recurring";
import {
  buildCategorySuggester,
  toCandidates,
  type ImportCandidate,
  type ImportKind,
} from "@/domain/import-normalize";
import { reconcileRunningBalance, type Reconciliation } from "@/domain/import-reconcile";
import { findParser } from "@/import/parsers";
import { extractPdfText } from "@/import/pdf-text";
import type { ParsedStatement } from "@/import/types";
import { todayUtc } from "@/lib/dates";
import { getDisplayCurrency } from "@/services/dashboard-summary";

const MAX_BYTES = 5 * 1024 * 1024;

export type PreviewRow = {
  position: number;
  occurredOn: string | null;
  kind: ImportKind;
  amountCents: number | null;
  description: string;
  categoryId: number | null;
  flag: { type: ImportFlag["type"]; reason: string } | null;
  issue: string | null;
  unlinked: boolean;
  included: boolean;
  /** Set when this row confirms an entry a recurring template posted with a different amount or date. */
  recurringUpdate: {
    previousAmountCents: number;
    previousOccurredOn: string;
    frozenReason: string | null;
  } | null;
};

export type ImportPreview = {
  id: string;
  fileName: string;
  parserLabel: string;
  currency: string;
  periodFrom: string | null;
  periodTo: string | null;
  closingBalanceCents: number | null;
  previousImports: string[];
  notes: string[];
  reconciliation: Reconciliation;
  assetId: number | null;
  assetName: string | null;
  linkMode: LinkMode;
  link: { closing: LinkPlan["closing"]; negativeAt: number | null; snapshotsAdded: number };
  latestBalanceOn: string | null;
  rows: PreviewRow[];
};

export type PreviewState = { ok: true; preview: ImportPreview } | { ok: false; error: string } | null;

export type ConfirmResult = { ok: false; error: string; position: number | null };

type Analysis =
  | { ok: false; error: string }
  | {
      ok: true;
      fileName: string;
      sha256: string;
      statement: ParsedStatement;
      candidates: ImportCandidate[];
      assetId: number | null;
      assetName: string | null;
      linkMode: LinkMode;
    };

function readAssetId(formData: FormData): number | null | undefined {
  const raw = String(formData.get("assetId") ?? "").trim();
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

async function analyze(formData: FormData): Promise<Analysis> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF statement to upload." };
  if (file.size > MAX_BYTES) return { ok: false, error: "This file is larger than 5 MB." };
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return { ok: false, error: "Upload a PDF statement." };
  }

  const assetId = readAssetId(formData);
  const cash = listAssets().filter((a) => a.type === "cash");
  const asset = assetId == null ? null : cash.find((a) => a.id === assetId);
  if (assetId === undefined || (assetId !== null && !asset)) return { ok: false, error: "Choose a cash account." };
  const rawMode = String(formData.get("linkMode") ?? "none");
  const linkMode: LinkMode = asset && isLinkMode(rawMode) ? rawMode : "none";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const extracted = await extractPdfText(bytes);
  if (!extracted.ok) {
    const messages = {
      encrypted: "This PDF is password-protected. Download an unprotected copy from your bank.",
      no_text: "This PDF has no selectable text (scanned?). Download the digital statement from your bank instead.",
      unreadable: "This file could not be read as a PDF.",
    };
    return { ok: false, error: messages[extracted.reason] };
  }

  const parser = findParser(extracted.text);
  if (!parser) return { ok: false, error: "This statement format isn't supported yet." };
  const statement = parser.parse(extracted.text);
  if (statement.rows.length === 0) return { ok: false, error: "No movements were found in this statement." };
  const currency = getDisplayCurrency();
  if (statement.currency !== currency) {
    return {
      ok: false,
      error: `This statement is in ${statement.currency}, but Ledgerly uses ${currency}. Multi-currency imports aren't supported.`,
    };
  }

  return {
    ok: true,
    fileName: file.name,
    sha256,
    statement,
    candidates: toCandidates(statement.rows),
    assetId: asset?.id ?? null,
    assetName: asset?.name ?? null,
    linkMode,
  };
}

function datesOf(candidates: ImportCandidate[]): [string, string] {
  const dates = candidates.flatMap((c) => (c.occurredOn ? [c.occurredOn] : [])).sort();
  const today = todayUtc();
  return [dates[0] ?? today, dates.at(-1) ?? today];
}

export async function previewImportAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const analysis = await analyze(formData);
  if (!analysis.ok) return analysis;
  const { statement, candidates } = analysis;

  const [from, to] = datesOf(candidates);
  const context = getImportContext(from, to);
  const flags = flagCandidates({
    candidates,
    existing: context.existing,
    templates: context.templates,
    holderName: statement.holderName,
  });
  const option = (c: { id: number; name: string }) => ({ id: c.id, name: c.name });
  const suggest = buildCategorySuggester({
    history: context.history,
    categories: {
      expense: listCategories("expense").map(option),
      income: listCategories("income").map(option),
    },
    asOf: todayUtc(),
  });

  const reconciles = buildRecurringReconciles(candidates, flags);
  const frozen = frozenEntryKeys(reconciles);
  const offers = new Map(
    reconciles
      .filter((r) => r.differs)
      .map((r) => [
        r.position,
        {
          previousAmountCents: r.previousAmountCents,
          previousOccurredOn: r.previousOccurredOn,
          frozenReason: frozen.has(`${r.kind}:${r.entryId}`)
            ? "This entry's cash balance was followed by a newer balance; unlink it in Activity to update it."
            : null,
        },
      ]),
  );

  const latest = analysis.assetId === null ? null : getLatestSnapshot(analysis.assetId);
  const plan = planCashLinks({
    mode: analysis.linkMode,
    rows: candidates.flatMap((c) =>
      c.issue === null && c.occurredOn !== null && c.amountCents !== null
        ? [{ position: c.position, occurredOn: c.occurredOn, kind: c.kind, amountCents: c.amountCents }]
        : [],
    ),
    latest,
    closingBalanceCents: statement.closingBalanceCents,
    periodTo: statement.periodTo,
  });

  return {
    ok: true,
    preview: {
      id: randomUUID(),
      fileName: analysis.fileName,
      parserLabel: statement.label,
      currency: statement.currency,
      periodFrom: statement.periodFrom,
      periodTo: statement.periodTo,
      closingBalanceCents: statement.closingBalanceCents,
      previousImports: findBatchesByFileHash(analysis.sha256).map((b) => b.createdAt.slice(0, 10)),
      reconciliation: reconcileRunningBalance(
        statement.rows,
        statement.closingBalanceCents,
        statement.openingBalanceCents,
      ),
      notes: statement.notes,
      assetId: analysis.assetId,
      assetName: analysis.assetName,
      linkMode: analysis.linkMode,
      link: { closing: plan.closing, negativeAt: plan.negativeAt, snapshotsAdded: plan.snapshotsAdded },
      latestBalanceOn: latest?.recordedOn ?? null,
      rows: candidates.map((c) => {
        const flag = flags.get(c.position);
        return {
          position: c.position,
          occurredOn: c.occurredOn,
          kind: c.kind,
          amountCents: c.amountCents,
          description: c.description,
          categoryId: c.issue === null ? suggest(c) : null,
          flag: flag ? { type: flag.type, reason: flag.reason } : null,
          issue: c.issue,
          unlinked: plan.unlinked.has(c.position),
          included: c.issue === null && !flag,
          recurringUpdate: offers.get(c.position) ?? null,
        };
      }),
    },
  };
}

const SelectionSchema = z
  .array(
    z.object({
      position: z.number().int().positive(),
      categoryId: z.number().int().positive().nullable(),
      note: z.string().max(500),
      /** Investment trade rows only: import just this fee, as an expense. */
      feeCents: z.number().int().positive().optional(),
    }),
  )
  .max(5_000);

const UpdatesSchema = z.array(z.number().int().positive()).max(5_000);

export async function confirmImportAction(formData: FormData): Promise<ConfirmResult> {
  let selections: z.infer<typeof SelectionSchema>;
  let updatePositions: number[];
  try {
    selections = SelectionSchema.parse(JSON.parse(String(formData.get("selections") ?? "[]")));
    updatePositions = UpdatesSchema.parse(JSON.parse(String(formData.get("updates") ?? "[]")));
  } catch {
    return { ok: false, error: "The selection could not be read. Reload and try again.", position: null };
  }
  if (selections.length === 0 && updatePositions.length === 0) {
    return { ok: false, error: "Select at least one row to import.", position: null };
  }

  const analysis = await analyze(formData);
  if (!analysis.ok) return { ...analysis, position: null };
  const byPosition = new Map(analysis.candidates.map((c) => [c.position, c]));
  const [from, to] = datesOf(analysis.candidates);
  const context = getImportContext(from, to);
  const flags = flagCandidates({
    candidates: analysis.candidates,
    existing: context.existing,
    templates: context.templates,
    holderName: analysis.statement.holderName,
  });
  const resolved = resolveRecurringUpdates(buildRecurringReconciles(analysis.candidates, flags), updatePositions);
  if (!resolved.ok) return { ...resolved, position: null };
  const selected = new Set(selections.map((s) => s.position));

  const rows = [];
  for (const selection of selections) {
    const candidate = byPosition.get(selection.position);
    if (!candidate) return { ok: false, error: "A selected row is not in this statement.", position: selection.position };
    if (
      candidate.issue !== null ||
      candidate.occurredOn === null ||
      candidate.amountCents === null ||
      candidate.fingerprint === null
    ) {
      return { ok: false, error: candidate.issue ?? "This row cannot be imported.", position: candidate.position };
    }
    const imported = resolveImportedAmount({
      kind: candidate.kind,
      amountCents: candidate.amountCents,
      flagType: flags.get(candidate.position)?.type ?? null,
      feeCents: selection.feeCents,
    });
    if (!imported.ok) return { ok: false, error: imported.error, position: candidate.position };
    rows.push({
      position: candidate.position,
      occurredOn: candidate.occurredOn,
      kind: imported.kind,
      amountCents: imported.amountCents,
      categoryId: selection.categoryId,
      note: selection.note.trim() || candidate.description,
      fingerprint: candidate.fingerprint,
    });
  }

  let result;
  try {
    result = confirmImport({
      parserId: analysis.statement.parserId,
      fileName: analysis.fileName,
      fileSha256: analysis.sha256,
      periodFrom: analysis.statement.periodFrom,
      periodTo: analysis.statement.periodTo,
      closingBalanceCents: analysis.statement.closingBalanceCents,
      assetId: analysis.assetId,
      linkMode: analysis.linkMode,
      rows,
      // A row the user chose to import anyway doesn't also confirm the posted entry.
      recurring: resolved.items.filter((item) => !selected.has(item.position)),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The import could not be saved.",
      position: error instanceof ImportRowError ? error.position : null,
    };
  }

  revalidateImportPaths(analysis.assetId);
  const params = new URLSearchParams({
    saved: "imported",
    rows: String(result.batch.rowCount),
    updated: String(result.updatedCount),
    unlinked: String(result.unlinkedCount),
    closing: result.closing,
  });
  redirect(`/activity/import?${params.toString()}`);
}

function revalidateImportPaths(assetId: number | null) {
  for (const path of ["/activity", "/activity/import", "/", "/assets", "/emergency-fund"]) revalidatePath(path);
  if (assetId !== null) revalidatePath(`/assets/${assetId}`);
}

export async function undoImportAction(formData: FormData) {
  const raw = String(formData.get("id") ?? "");
  const result = /^\d+$/.test(raw) ? undoImport(Number(raw)) : ({ ok: false, error: "Import not found." } as const);
  if (!result.ok) redirect(`/activity/import?error=${encodeURIComponent(result.error)}`);
  revalidateImportPaths(null);
  redirect(`/activity/import?saved=undone&rows=${result.removed}`);
}
