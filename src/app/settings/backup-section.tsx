"use client";

import { useRef, useState, useTransition } from "react";

export function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<
    | { status: "idle" }
    | { status: "selected"; filename: string }
    | { status: "confirming" }
    | { status: "success" }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setImportState({ status: "idle" });
      return;
    }
    setImportState({ status: "selected", filename: file.name });
  }

  function handleConfirm() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImportState({ status: "confirming" });

    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/settings/import", {
          method: "POST",
          body: formData,
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          setImportState({ status: "success" });
          if (fileRef.current) fileRef.current.value = "";
        } else {
          setImportState({
            status: "error",
            message: json.error ?? "Import failed",
          });
        }
      } catch {
        setImportState({ status: "error", message: "Network error" });
      }
    });
  }

  function handleCancel() {
    setImportState({ status: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="border-t border-stone-200 pt-4">
      <h2 className="font-medium text-stone-800">Backup &amp; Restore</h2>
      <p className="mt-1 text-sm text-stone-600">
        Export all your data as a JSON file, or restore from a previous export.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {/* Export */}
        <div>
          <a
            href="/settings/export"
            download
            className="inline-flex items-center rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
          >
            Download backup
          </a>
          <p className="mt-1 text-xs text-stone-500">
            Downloads a versioned JSON file with all your assets, snapshots, goals, and settings.
          </p>
        </div>

        {/* Import */}
        <div>
          <label className="block text-sm font-medium text-stone-700">
            Restore from backup
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="mt-1 block text-sm text-stone-700 file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-50"
          />

          {importState.status === "selected" && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <p>
                <strong>Warning:</strong> importing{" "}
                <span className="font-mono">{importState.filename}</span> will
                replace <strong>all existing data</strong>, including assets,
                snapshots, goals, and settings. This cannot be undone.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                >
                  Yes, replace all data
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isPending}
                  className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {importState.status === "confirming" && (
            <p className="mt-2 text-sm text-stone-600">Importing…</p>
          )}

          {importState.status === "success" && (
            <p
              role="status"
              className="mt-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
            >
              Data restored successfully. Reload the page to see the updated
              information.
            </p>
          )}

          {importState.status === "error" && (
            <p
              role="alert"
              className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
            >
              {importState.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
