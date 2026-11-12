"use client";

import { useActionState } from "react";
import { MoneyInput } from "@/components/money-input";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-state";

type Option = { id: number; name: string };

export type RecurringFormDefaults = {
  kind: "expense" | "income";
  amount: string;
  amountVaries: boolean;
  cadence: "monthly" | "yearly" | "weekly";
  anchorOn: string;
  endOn: string;
  categoryId: number | null;
  assetId: number | null;
  note: string;
  matchText: string;
};

type RecurringFormProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  idPrefix: string;
  submitLabel: string;
  templateId?: number;
  cancelHref?: string;
  expenseCategories: Option[];
  incomeCategories: Option[];
  cashAccounts: Option[];
  defaults: RecurringFormDefaults;
};

const FIELD_CN =
  "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

export function RecurringForm({
  action,
  idPrefix,
  submitLabel,
  templateId,
  cancelHref,
  expenseCategories,
  incomeCategories,
  cashAccounts,
  defaults,
}: RecurringFormProps) {
  const [state, formAction] = useActionState(action, null);
  const e = state?.errors ?? {};
  const v = state?.values;
  const value = (key: keyof RecurringFormDefaults, fallback: string) => v?.[key] ?? fallback;
  const id = (name: string) => `${idPrefix}-${name}`;
  const described = (name: string) => (e[name] ? `${id(name)}-error` : undefined);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {templateId !== undefined ? <input type="hidden" name="id" value={templateId} /> : null}

      {e._form ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e._form}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={id("note")} className="text-sm font-medium text-stone-800">
          Description
        </label>
        <input
          id={id("note")}
          name="note"
          type="text"
          maxLength={500}
          required
          autoComplete="off"
          placeholder="Rent"
          defaultValue={value("note", defaults.note)}
          aria-invalid={!!e.note}
          aria-describedby={described("note")}
          className={FIELD_CN}
        />
        <FieldError id={`${id("note")}-error`} message={e.note} />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-stone-800">Type</legend>
        <div className="mt-1 flex gap-4 text-sm text-stone-800">
          {(["expense", "income"] as const).map((kind) => (
            <label key={kind} className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value={kind}
                defaultChecked={value("kind", defaults.kind) === kind}
                className="accent-teal-800"
              />
              {kind === "expense" ? "Expense" : "Income"}
            </label>
          ))}
        </div>
        <FieldError id={`${id("kind")}-error`} message={e.kind} />
      </fieldset>

      <MoneyInput
        id={id("amount")}
        name="amount"
        label="Amount"
        defaultValue={value("amount", defaults.amount)}
        error={e.amount}
      />

      <label className="flex items-center gap-2 text-sm text-stone-800">
        <input
          type="checkbox"
          name="amountVaries"
          value="1"
          defaultChecked={v ? v.amountVaries === "1" : defaults.amountVaries}
          className="accent-teal-800"
        />
        Amount varies (utilities, phone). You confirm the real amount each time.
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={id("cadence")} className="text-sm font-medium text-stone-800">
            Repeats
          </label>
          <select
            id={id("cadence")}
            name="cadence"
            defaultValue={value("cadence", defaults.cadence)}
            aria-invalid={!!e.cadence}
            aria-describedby={described("cadence")}
            className={FIELD_CN}
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="yearly">Yearly</option>
          </select>
          <FieldError id={`${id("cadence")}-error`} message={e.cadence} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={id("anchorOn")} className="text-sm font-medium text-stone-800">
            First date
          </label>
          <input
            id={id("anchorOn")}
            name="anchorOn"
            type="date"
            required
            defaultValue={value("anchorOn", defaults.anchorOn)}
            aria-invalid={!!e.anchorOn}
            aria-describedby={described("anchorOn")}
            className={FIELD_CN}
          />
          <FieldError id={`${id("anchorOn")}-error`} message={e.anchorOn} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={id("endOn")} className="text-sm font-medium text-stone-800">
            End date <span className="font-normal text-stone-600">(optional)</span>
          </label>
          <input
            id={id("endOn")}
            name="endOn"
            type="date"
            defaultValue={value("endOn", defaults.endOn)}
            aria-invalid={!!e.endOn}
            aria-describedby={described("endOn")}
            className={FIELD_CN}
          />
          <FieldError id={`${id("endOn")}-error`} message={e.endOn} />
        </div>
      </div>
      <p className="-mt-2 text-xs text-stone-600">
        Monthly entries on the 29th–31st fall on the last day of shorter months.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor={id("categoryId")} className="text-sm font-medium text-stone-800">
          Category
        </label>
        <select
          id={id("categoryId")}
          name="categoryId"
          defaultValue={value(
            "categoryId",
            defaults.categoryId === null ? "" : String(defaults.categoryId),
          )}
          aria-invalid={!!e.categoryId}
          aria-describedby={described("categoryId")}
          className={FIELD_CN}
        >
          <option value="">Uncategorized</option>
          {expenseCategories.length > 0 ? (
            <optgroup label="Expense categories">
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {incomeCategories.length > 0 ? (
            <optgroup label="Income categories">
              {incomeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <FieldError id={`${id("categoryId")}-error`} message={e.categoryId} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={id("assetId")} className="text-sm font-medium text-stone-800">
          Cash account
        </label>
        <select
          id={id("assetId")}
          name="assetId"
          defaultValue={value("assetId", defaults.assetId === null ? "" : String(defaults.assetId))}
          aria-invalid={!!e.assetId}
          aria-describedby={e.assetId ? `${id("assetId")}-error` : `${id("assetId")}-hint`}
          className={FIELD_CN}
        >
          <option value="">None — journal only</option>
          {cashAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {e.assetId ? (
          <FieldError id={`${id("assetId")}-error`} message={e.assetId} />
        ) : (
          <p id={`${id("assetId")}-hint`} className="text-xs text-stone-600">
            Optional. Each posted entry updates this balance with a snapshot. Entries
            dated before the latest balance are posted without the link.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={id("matchText")} className="text-sm font-medium text-stone-800">
          Bank description contains <span className="font-normal text-stone-600">(optional)</span>
        </label>
        <input
          id={id("matchText")}
          name="matchText"
          type="text"
          maxLength={100}
          autoComplete="off"
          placeholder="ENDESA"
          defaultValue={value("matchText", defaults.matchText)}
          aria-invalid={!!e.matchText}
          aria-describedby={e.matchText ? `${id("matchText")}-error` : `${id("matchText")}-hint`}
          className={FIELD_CN}
        />
        {e.matchText ? (
          <FieldError id={`${id("matchText")}-error`} message={e.matchText} />
        ) : (
          <p id={`${id("matchText")}-hint`} className="text-xs text-stone-600">
            Text that appears on your bank statement for this entry. Statement imports use it to
            spot rows this template already posted, even when the amount differs.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
        {cancelHref ? (
          <a
            href={cancelHref}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
          >
            Cancel
          </a>
        ) : null}
      </div>
    </form>
  );
}
