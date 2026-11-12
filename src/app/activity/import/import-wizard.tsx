"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { feeNote, parseTradeFee, type FeeResult } from "@/domain/import-fee";
import { formatMoney } from "@/lib/money";
import { formatIsoDate } from "../../assets/labels";
import {
  confirmImportAction,
  previewImportAction,
  type ImportPreview,
  type PreviewRow,
} from "./actions";

type Option = { id: number; name: string };

type Props = {
  cashAccounts: Option[];
  categories: { expense: Option[]; income: Option[] };
  currency: string;
};

const FIELD_CN =
  "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700";

const FLAG_LABEL: Record<NonNullable<PreviewRow["flag"]>["type"], string> = {
  exact: "Already imported",
  likely_recurring: "Recurring",
  likely_manual: "Possible duplicate",
  own_transfer: "Own transfer",
  investment_trade: "Investment trade",
  offsetting_pair: "Cancels out",
};

export function ImportWizard({ cashAccounts, categories, currency }: Props) {
  const [state, previewAction] = useActionState(previewImportAction, null);
  const [previewing, startPreview] = useTransition();
  const fileRef = useRef<File | null>(null);
  const [assetId, setAssetId] = useState("");
  const [linkMode, setLinkMode] = useState("closing");

  return (
    <div className="flex flex-col gap-8">
      <form
        // Dispatching manually avoids React's automatic form reset, which would clear the chosen file.
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startPreview(() => previewAction(formData));
        }}
        className="flex max-w-xl flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="import-file" className="text-sm font-medium text-stone-800">
            Statement (PDF)
          </label>
          <input
            id="import-file"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
            onChange={(event) => {
              fileRef.current = event.target.files?.[0] ?? null;
            }}
            className="text-sm text-stone-800 file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-800 hover:file:bg-stone-100"
          />
          <p className="text-xs text-stone-600">
            Supported: Caixa Geral de Depósitos &ldquo;Consultar saldos e movimentos&rdquo; export,
            ActivoBank &ldquo;Extrato Combinado&rdquo; and Trade Republic &ldquo;Account statement&rdquo;. The
            file is read on this computer and is not stored.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="import-asset" className="text-sm font-medium text-stone-800">
            Cash account <span className="font-normal text-stone-600">(optional)</span>
          </label>
          <select
            id="import-asset"
            name="assetId"
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            className={FIELD_CN}
          >
            <option value="">None — journal only</option>
            {cashAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {assetId !== "" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-stone-800">Update the account balance</legend>
            {[
              {
                value: "closing",
                label: "With the statement's closing balance",
                hint: "One balance snapshot dated the statement's last day. Recommended.",
              },
              {
                value: "per_row",
                label: "After every row",
                hint: "Each row adds a balance snapshot. Rows dated before the account's latest balance are imported without it.",
              },
              { value: "none", label: "Don't change the balance", hint: "Journal entries only." },
            ].map((option) => (
              <label key={option.value} className="flex items-start gap-2 text-sm text-stone-800">
                <input
                  type="radio"
                  name="linkMode"
                  value={option.value}
                  checked={linkMode === option.value}
                  onChange={() => setLinkMode(option.value)}
                  className="mt-1 accent-teal-800"
                />
                <span>
                  {option.label}
                  <span className="block text-xs text-stone-600">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {state && !state.ok ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={previewing}
          className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:opacity-60"
        >
          {previewing ? "Reading statement…" : "Preview import"}
        </button>
      </form>

      {state?.ok ? (
        <PreviewPanel
          key={state.preview.id}
          preview={state.preview}
          categories={categories}
          currency={currency}
          getFile={() => fileRef.current}
        />
      ) : null}
    </div>
  );
}

type Selection = { included: boolean; categoryId: number | null; note: string; feeText: string };

/** The fee typed on an investment trade row, or null when there is none. */
function feeOf(row: PreviewRow, selection: Selection): FeeResult | null {
  if (row.flag?.type !== "investment_trade" || row.amountCents === null) return null;
  if (selection.feeText.trim() === "") return null;
  return parseTradeFee(selection.feeText, row.amountCents);
}

/** What the row will import as: the whole row, or only the fee as an expense. */
function effectiveOf(row: PreviewRow, selection: Selection) {
  const fee = feeOf(row, selection);
  return fee?.ok
    ? { kind: "expense" as const, amountCents: fee.cents, fee }
    : { kind: row.kind, amountCents: row.amountCents, fee };
}

function ReconciliationNote({ preview, currency }: { preview: ImportPreview; currency: string }) {
  const r = preview.reconciliation;
  if (r.status === "ok") {
    return (
      <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
        Balances reconcile: every row follows from the one before
        {r.closingMatches ? " and the last balance matches the statement's closing balance" : ""}.
      </p>
    );
  }
  if (r.status === "broken") {
    return (
      <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Row {r.position} doesn&apos;t follow from the row before it (off by{" "}
        {formatMoney(r.differenceCents, currency)}). A movement may be missing or misread. Check the
        statement before importing.
      </p>
    );
  }
  if (r.status === "closing_mismatch") {
    return (
      <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        The last row&apos;s balance differs from the statement&apos;s closing balance by{" "}
        {formatMoney(r.differenceCents, currency)}.
      </p>
    );
  }
  return (
    <p className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
      This statement has no running balance to check against.
    </p>
  );
}

function LinkNote({ preview, currency }: { preview: ImportPreview; currency: string }) {
  if (preview.assetName === null || preview.linkMode === "none") return null;
  const closing = preview.closingBalanceCents;
  const notes: Record<string, string> = {
    write: `${preview.assetName} gets one balance of ${closing === null ? "" : formatMoney(closing, currency)} on ${preview.periodTo ? formatIsoDate(preview.periodTo) : ""}.`,
    skip_newer: `${preview.assetName} already has a balance on ${preview.latestBalanceOn ? formatIsoDate(preview.latestBalanceOn) : "a later date"}, so the closing balance will not be added.`,
    skip_negative: "The closing balance is negative, so it will not be added.",
    unavailable: "This statement has no closing balance, so the account balance will not change.",
  };
  const text =
    preview.linkMode === "closing"
      ? notes[preview.link.closing]
      : `This adds ${preview.link.snapshotsAdded} balance snapshot${preview.link.snapshotsAdded === 1 ? "" : "s"} to ${preview.assetName}.`;
  return (
    <div className="flex flex-col gap-2">
      {text ? <p className="text-sm text-stone-700">{text}</p> : null}
      {preview.linkMode === "per_row" && preview.link.negativeAt !== null ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Row {preview.link.negativeAt} would make the {preview.assetName} balance negative. Choose another
          balance option or untick rows before it.
        </p>
      ) : null}
    </div>
  );
}

function PreviewPanel({
  preview,
  categories,
  currency,
  getFile,
}: {
  preview: ImportPreview;
  categories: { expense: Option[]; income: Option[] };
  currency: string;
  getFile: () => File | null;
}) {
  const [selections, setSelections] = useState<Map<number, Selection>>(
    () =>
      new Map(
        preview.rows.map((row) => [
          row.position,
          { included: row.included, categoryId: row.categoryId, note: row.description, feeText: "" },
        ]),
      ),
  );
  const [updates, setUpdates] = useState<Set<number>>(
    () =>
      new Set(
        preview.rows
          .filter((row) => row.recurringUpdate !== null && row.recurringUpdate.frozenReason === null)
          .map((row) => row.position),
      ),
  );
  const [error, setError] = useState<{ message: string; position: number | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (position: number, patch: Partial<Selection>) =>
    setSelections((current) => new Map(current).set(position, { ...current.get(position)!, ...patch }));

  // Typing a valid fee ticks the row and turns it into a fee expense; clearing it
  // puts the row back as the unticked trade.
  const changeFee = (row: PreviewRow, feeText: string) =>
    setSelections((current) => {
      const previous = current.get(row.position)!;
      const before = effectiveOf(row, previous);
      const next: Selection = { ...previous, feeText };
      const after = effectiveOf(row, next);
      if (after.fee?.ok && !before.fee?.ok) {
        next.included = true;
        if (previous.note === row.description) next.note = feeNote(row.description);
      }
      if (feeText.trim() === "" && before.fee !== null) {
        next.included = false;
        if (previous.note === feeNote(row.description)) next.note = row.description;
      }
      if (after.kind !== before.kind) next.categoryId = after.kind === row.kind ? row.categoryId : null;
      return new Map(current).set(row.position, next);
    });

  const totals = useMemo(() => {
    let count = 0;
    let inCents = 0;
    let outCents = 0;
    let feeErrors = 0;
    for (const row of preview.rows) {
      const selection = selections.get(row.position)!;
      if (!selection.included || row.amountCents === null) continue;
      const effective = effectiveOf(row, selection);
      count += 1;
      // An invalid fee blocks import; leave its amount out rather than count the whole trade.
      if (effective.fee && !effective.fee.ok) {
        feeErrors += 1;
        continue;
      }
      if (effective.kind === "income") inCents += effective.amountCents!;
      else outCents += effective.amountCents!;
    }
    return { count, inCents, outCents, feeErrors };
  }, [preview.rows, selections]);

  const confirm = () => {
    const file = getFile();
    if (!file) {
      setError({ message: "Choose the file again, then preview before importing.", position: null });
      return;
    }
    const chosen = preview.rows
      .filter((row) => selections.get(row.position)?.included)
      .map((row) => {
        const s = selections.get(row.position)!;
        const fee = feeOf(row, s);
        return {
          position: row.position,
          categoryId: s.categoryId,
          note: s.note,
          ...(fee?.ok ? { feeCents: fee.cents } : {}),
        };
      });
    const formData = new FormData();
    formData.set("file", file);
    formData.set("assetId", preview.assetId === null ? "" : String(preview.assetId));
    formData.set("linkMode", preview.linkMode);
    formData.set("selections", JSON.stringify(chosen));
    formData.set(
      "updates",
      JSON.stringify([...updates].filter((position) => !selections.get(position)?.included)),
    );
    setError(null);
    startTransition(async () => {
      const result = await confirmImportAction(formData);
      if (result && !result.ok) {
        setError({ message: result.error, position: result.position });
        if (result.position !== null) {
          document.getElementById(`import-row-${result.position}`)?.scrollIntoView({ block: "center" });
        }
      }
    });
  };

  const flaggedCount = preview.rows.filter((row) => row.flag !== null).length;
  const updateCount = [...updates].filter((position) => !selections.get(position)?.included).length;

  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-4 border-t border-stone-200 pt-6">
      <div>
        <h2 id="preview-heading" className="text-lg font-semibold">
          Preview
        </h2>
        <p className="mt-1 text-sm text-stone-700">
          {preview.fileName} · {preview.parserLabel}
          {preview.periodFrom && preview.periodTo
            ? ` · ${formatIsoDate(preview.periodFrom)} – ${formatIsoDate(preview.periodTo)}`
            : ""}
        </p>
      </div>

      {preview.previousImports.length > 0 ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You already imported this exact file on {preview.previousImports.map(formatIsoDate).join(", ")}.
        </p>
      ) : null}

      {preview.notes.map((note) => (
        <p key={note} className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
          {note}
        </p>
      ))}

      <ReconciliationNote preview={preview} currency={currency} />
      <LinkNote preview={preview} currency={currency} />

      <p className="text-sm text-stone-700">
        {preview.rows.length} rows · {totals.count} selected · in{" "}
        <span className="tabular-nums">{formatMoney(totals.inCents, currency)}</span> · out{" "}
        <span className="tabular-nums">{formatMoney(totals.outCents, currency)}</span>
        {flaggedCount > 0 ? ` · ${flaggedCount} flagged and unticked — review them below` : ""}
        {updateCount > 0
          ? ` · ${updateCount} posted ${updateCount === 1 ? "entry" : "entries"} will be updated to the bank amount`
          : ""}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-stone-600">
            <tr>
              <th className="py-2 pr-3 font-medium">Import</th>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Note</th>
              <th className="py-2 pr-3 font-medium">Amount</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 font-medium">Check</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const selection = selections.get(row.position)!;
              const effective = effectiveOf(row, selection);
              const options = categories[effective.kind];
              const highlighted = error?.position === row.position;
              return (
                <tr
                  key={row.position}
                  id={`import-row-${row.position}`}
                  className={`border-b border-stone-100 align-top ${
                    highlighted ? "bg-red-50" : row.issue ? "bg-red-50/50" : row.flag ? "bg-amber-50/60" : ""
                  } ${selection.included ? "" : "text-stone-500"}`}
                >
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`Import row ${row.position}: ${row.description}`}
                      checked={selection.included}
                      disabled={row.issue !== null}
                      onChange={(event) => update(row.position, { included: event.target.checked })}
                      className="accent-teal-800"
                    />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {row.occurredOn ? formatIsoDate(row.occurredOn) : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      aria-label={`Note for row ${row.position}`}
                      value={selection.note}
                      maxLength={500}
                      onChange={(event) => update(row.position, { note: event.target.value })}
                      className="w-full min-w-48 rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    />
                  </td>
                  <td
                    className={`whitespace-nowrap py-2 pr-3 tabular-nums ${
                      effective.kind === "income" ? "text-teal-800" : ""
                    }`}
                  >
                    {effective.amountCents === null
                      ? "—"
                      : `${effective.kind === "income" ? "+" : "−"}${formatMoney(effective.amountCents, currency)}`}
                    {effective.fee?.ok && row.amountCents !== null ? (
                      <span className="block text-xs text-stone-600">
                        fee of a {formatMoney(row.amountCents, currency)} trade
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`Category for row ${row.position}`}
                      value={selection.categoryId === null ? "" : String(selection.categoryId)}
                      onChange={(event) =>
                        update(row.position, {
                          categoryId: event.target.value === "" ? null : Number(event.target.value),
                        })
                      }
                      className="rounded-md border border-stone-200 bg-white px-2 py-1 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                    >
                      <option value="">Uncategorized</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-xs">
                    {row.issue ? <span className="font-medium text-red-800">{row.issue}</span> : null}
                    {row.flag ? (
                      <span className="text-amber-900">
                        <span className="font-medium">{FLAG_LABEL[row.flag.type]}.</span> {row.flag.reason}
                      </span>
                    ) : null}
                    {row.flag?.type === "investment_trade" && row.amountCents !== null ? (
                      <span className="mt-1 block text-stone-800">
                        <label className="flex items-center gap-1.5">
                          <span>Split off a fee</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            aria-label={`Fee for row ${row.position}`}
                            aria-invalid={effective.fee !== null && !effective.fee.ok}
                            value={selection.feeText}
                            onChange={(event) => changeFee(row, event.target.value)}
                            className="w-20 rounded-md border border-stone-200 bg-white px-2 py-1 text-sm tabular-nums text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                          />
                        </label>
                        {effective.fee && !effective.fee.ok ? (
                          <span className="block text-red-800">{effective.fee.error}</span>
                        ) : (
                          <span className="block text-stone-600">Imports only the fee, as an expense.</span>
                        )}
                      </span>
                    ) : null}
                    {row.recurringUpdate ? (
                      <label className="mt-1 flex items-start gap-1.5 text-stone-800">
                        <input
                          type="checkbox"
                          checked={updates.has(row.position) && !selection.included}
                          disabled={row.recurringUpdate.frozenReason !== null || selection.included}
                          onChange={(event) =>
                            setUpdates((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(row.position);
                              else next.delete(row.position);
                              return next;
                            })
                          }
                          className="mt-0.5 accent-teal-800"
                        />
                        <span>
                          Update the posted entry to{" "}
                          {row.amountCents === null ? "" : formatMoney(row.amountCents, currency)}
                          {row.occurredOn ? ` on ${formatIsoDate(row.occurredOn)}` : ""} (was{" "}
                          {formatMoney(row.recurringUpdate.previousAmountCents, currency)} on{" "}
                          {formatIsoDate(row.recurringUpdate.previousOccurredOn)})
                          {row.recurringUpdate.frozenReason ? (
                            <span className="block text-stone-600">{row.recurringUpdate.frozenReason}</span>
                          ) : null}
                        </span>
                      </label>
                    ) : null}
                    {row.unlinked ? (
                      <span className="block text-stone-600">Imported without the cash link (before the latest balance).</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totals.feeErrors > 0 ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Fix the fee on {totals.feeErrors === 1 ? "1 trade row" : `${totals.feeErrors} trade rows`}, or clear
          it to import the whole trade.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error.position !== null ? `Row ${error.position}: ` : ""}
          {error.message}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          onClick={confirm}
          disabled={pending || totals.feeErrors > 0 || (totals.count === 0 && updateCount === 0)}
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2 disabled:opacity-60"
        >
          {pending
            ? "Importing…"
            : `Import ${totals.count} row${totals.count === 1 ? "" : "s"}${
                updateCount > 0 ? ` and update ${updateCount} ${updateCount === 1 ? "entry" : "entries"}` : ""
              }`}
        </button>
      </div>
    </section>
  );
}
