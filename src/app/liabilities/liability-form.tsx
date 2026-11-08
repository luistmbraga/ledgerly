"use client";

import { useActionState } from "react";
import { LIABILITY_TYPES } from "@/domain/net-worth";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-state";
import { LIABILITY_TYPE_LABELS } from "./labels";

type LiabilityFormProps = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  id?: number;
  defaults?: {
    name: string;
    type: string;
    notes: string;
  };
};

export function LiabilityForm({
  action,
  submitLabel,
  id,
  defaults,
}: LiabilityFormProps) {
  const [state, formAction] = useActionState(action, null);
  const e = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {id !== undefined ? <input type="hidden" name="id" value={id} /> : null}

      {e._form ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e._form}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(id, "name")} className="text-sm font-medium">
          Name
        </label>
        <input
          id={fieldId(id, "name")}
          name="name"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          defaultValue={defaults?.name ?? ""}
          aria-invalid={!!e.name}
          aria-describedby={e.name ? fieldId(id, "name-error") : undefined}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.name ? (
          <p id={fieldId(id, "name-error")} role="alert" className="text-sm text-red-700">
            {e.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(id, "type")} className="text-sm font-medium">
          Type
        </label>
        <select
          id={fieldId(id, "type")}
          name="type"
          defaultValue={defaults?.type ?? "loan"}
          aria-invalid={!!e.type}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        >
          {LIABILITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {LIABILITY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {e.type ? (
          <p role="alert" className="text-sm text-red-700">
            {e.type}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId(id, "notes")} className="text-sm font-medium">
          Notes
        </label>
        <textarea
          id={fieldId(id, "notes")}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={defaults?.notes ?? ""}
          aria-invalid={!!e.notes}
          aria-describedby={e.notes ? fieldId(id, "notes-error") : undefined}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-teal-700 aria-invalid:border-red-400"
        />
        {e.notes ? (
          <p id={fieldId(id, "notes-error")} role="alert" className="text-sm text-red-700">
            {e.notes}
          </p>
        ) : null}
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

function fieldId(id: number | undefined, name: string) {
  return id === undefined ? `liability-${name}` : `liability-${id}-${name}`;
}
