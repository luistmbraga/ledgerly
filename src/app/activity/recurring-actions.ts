"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createTemplate,
  deleteTemplate,
  postDue,
  setTemplateActive,
  updateTemplate,
  type PostRequest,
  type RecurringTemplateInput,
} from "@/db/repositories/recurring";
import { isCadence } from "@/domain/recurring";
import { isValidIsoDate, todayUtc } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";
import type { ActionState } from "@/lib/action-state";

function recurringPath(extra?: Record<string, string>): string {
  const params = new URLSearchParams({ tab: "recurring", ...extra });
  return `/activity?${params.toString()}`;
}

function readId(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

function readOptionalId(raw: string): number | null | undefined {
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : undefined;
}

const FIELDS = [
  "kind",
  "amount",
  "amountVaries",
  "cadence",
  "anchorOn",
  "endOn",
  "categoryId",
  "assetId",
  "note",
  "matchText",
] as const;

function extractValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "").trim()]));
}

function validateTemplate(values: Record<string, string>): {
  errors: Record<string, string>;
  input?: RecurringTemplateInput;
} {
  const errors: Record<string, string> = {};

  const kind = values.kind;
  if (kind !== "expense" && kind !== "income") errors.kind = "Choose expense or income.";

  const amount = parseMoneyToCents(values.amount);
  if (!amount.ok) errors.amount = amount.error;
  else if (amount.cents <= 0) errors.amount = "Enter an amount greater than zero.";

  if (!isCadence(values.cadence)) errors.cadence = "Choose how often it repeats.";
  if (!isValidIsoDate(values.anchorOn)) errors.anchorOn = "Enter a valid first date.";
  if (values.endOn !== "") {
    if (!isValidIsoDate(values.endOn)) errors.endOn = "Enter a valid end date.";
    else if (values.endOn < values.anchorOn) {
      errors.endOn = "End date must be on or after the first date.";
    }
  }

  const categoryId = readOptionalId(values.categoryId);
  if (categoryId === undefined) errors.categoryId = "Choose a category.";
  const assetId = readOptionalId(values.assetId);
  if (assetId === undefined) errors.assetId = "Choose a cash account.";

  if (values.note === "") errors.note = "Enter a description, for example \"Rent\".";
  else if (values.note.length > 500) errors.note = "Description must be 500 characters or fewer.";

  if (values.matchText.length > 100) {
    errors.matchText = "Bank description must be 100 characters or fewer.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors: {},
    input: {
      kind: kind as RecurringTemplateInput["kind"],
      amountCents: (amount as { ok: true; cents: number }).cents,
      amountVaries: values.amountVaries === "1",
      cadence: values.cadence as RecurringTemplateInput["cadence"],
      anchorOn: values.anchorOn,
      endOn: values.endOn === "" ? null : values.endOn,
      categoryId: categoryId ?? null,
      assetId: assetId ?? null,
      note: values.note,
      matchText: values.matchText === "" ? null : values.matchText,
    },
  };
}

function revalidateRecurring() {
  revalidatePath("/activity");
  revalidatePath("/");
}

export async function createTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractValues(formData);
  const { errors, input } = validateTemplate(values);
  if (!input) return { errors, values };
  try {
    createTemplate(input);
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the recurring entry." },
      values,
    };
  }
  revalidateRecurring();
  redirect(recurringPath({ saved: "recurring-created" }));
}

export async function updateTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = extractValues(formData);
  const id = readId(formData);
  if (id === null) redirect(recurringPath({ error: "Recurring entry not found." }));
  const { errors, input } = validateTemplate(values);
  if (!input) return { errors, values };
  let updated;
  try {
    updated = updateTemplate(id, input);
  } catch (error) {
    return {
      errors: { _form: error instanceof Error ? error.message : "Could not save the recurring entry." },
      values,
    };
  }
  if (!updated) redirect(recurringPath({ error: "Recurring entry not found." }));
  revalidateRecurring();
  redirect(recurringPath({ saved: "recurring-updated" }));
}

export async function toggleTemplateAction(formData: FormData) {
  const id = readId(formData);
  const active = formData.get("active") === "1";
  if (id === null || !setTemplateActive(id, active)) {
    redirect(recurringPath({ error: "Recurring entry not found." }));
  }
  revalidateRecurring();
  redirect(recurringPath({ saved: active ? "recurring-resumed" : "recurring-paused" }));
}

export async function deleteTemplateAction(formData: FormData) {
  const id = readId(formData);
  if (id === null || !deleteTemplate(id)) {
    redirect(recurringPath({ error: "Recurring entry not found." }));
  }
  revalidateRecurring();
  redirect(recurringPath({ saved: "recurring-deleted" }));
}

/** Form fields: `post` = "templateId:period" per checked row, `amount:templateId:period` per row. */
export async function postDueAction(formData: FormData) {
  const requests: PostRequest[] = [];
  for (const raw of formData.getAll("post")) {
    const key = String(raw);
    const match = /^(\d+):([0-9A-Z-]+)$/.exec(key);
    if (!match) continue;
    const amount = parseMoneyToCents(String(formData.get(`amount:${key}`) ?? "").trim());
    if (!amount.ok || amount.cents <= 0) {
      redirect(recurringPath({ error: "Enter an amount greater than zero for every selected entry." }));
    }
    requests.push({ templateId: Number(match[1]), period: match[2], amountCents: amount.cents });
  }
  if (requests.length === 0) {
    redirect(recurringPath({ error: "Select at least one entry to post." }));
  }

  let result;
  try {
    result = postDue(todayUtc(), requests);
  } catch (error) {
    redirect(
      recurringPath({
        error: error instanceof Error ? error.message : "Could not post the recurring entries.",
      }),
    );
  }
  revalidateRecurring();
  revalidatePath("/assets");
  revalidatePath("/emergency-fund");
  const unlinked = result.posted.filter((p) => p.unlinkedReason !== null).length;
  redirect(
    recurringPath({
      saved: "recurring-posted",
      posted: String(result.posted.length),
      unlinked: String(unlinked),
    }),
  );
}
