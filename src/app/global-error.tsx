"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, where
 * no other boundary is mounted. Must render its own <html>/<body>, and can't
 * rely on providers (they're part of what failed), so the markup stays plain.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-dvh items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
            <h1 className="text-lg font-semibold">Dragon Hub hit a problem</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Something went wrong while loading the app. Please try again — if
              it keeps happening, let the PTA board know.
            </p>
            <button
              onClick={reset}
              className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm"
            >
              Try again
            </button>
            {error.digest && (
              <p className="mt-4 text-xs text-muted-foreground">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
