"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              A critical error occurred. Please reload the page.
            </p>
            {error.digest ? (
              <p className="mt-1 font-mono text-xs text-stone-500">
                Error ID: {error.digest}
              </p>
            ) : null}
            <button
              onClick={reset}
              className="mt-6 rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
