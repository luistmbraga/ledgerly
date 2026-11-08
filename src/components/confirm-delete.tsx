"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

type ConfirmDeleteProps = {
  action: (formData: FormData) => void | Promise<void>;
  id: number;
  dialogKey?: string;
  hiddenFields?: Record<string, string>;
  title: string;
  body: string;
  triggerLabel: string;
  size?: "default" | "sm";
};

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function ConfirmDelete({
  action,
  id,
  dialogKey,
  hiddenFields,
  title,
  body,
  triggerLabel,
  size = "default",
}: ConfirmDeleteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `delete-title-${dialogKey ?? id}`;

  const triggerCn =
    size === "sm"
      ? "rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2"
      : "w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2";

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={triggerCn}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="w-[min(100%,24rem)] rounded-md border border-stone-200 p-0 text-stone-900 backdrop:bg-stone-900/40"
      >
        <div className="flex flex-col gap-4 p-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p className="text-sm text-stone-700">{body}</p>
          <div className="flex gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Cancel
            </button>
            <form action={action}>
              <input type="hidden" name="id" value={id} />
              {hiddenFields
                ? Object.entries(hiddenFields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))
                : null}
              <DeleteSubmitButton />
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
