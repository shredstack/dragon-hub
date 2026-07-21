"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  /** The error handed to the route's error boundary. */
  error: Error & { digest?: string };
  /** Re-renders the failed segment. Provided by Next.js error boundaries. */
  reset: () => void;
  title?: string;
  description?: string;
}

/**
 * Friendly replacement for the raw "a client-side exception has occurred"
 * screen. Shared by every error.tsx boundary so the wording stays consistent.
 */
export function ErrorState({
  error,
  reset,
  title = "Something went wrong",
  description = "This page hit an unexpected error. Trying again usually clears it up.",
}: ErrorStateProps) {
  useEffect(() => {
    // Surface the real error for anyone debugging with the console open. In
    // production Next.js strips the message, but the digest ties it back to a
    // server log entry.
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
          >
            Go to dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="mt-4 text-xs text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
