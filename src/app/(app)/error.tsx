"use client";

import { ErrorState } from "@/components/error-state";

/**
 * Keeps the app chrome (sidebar + header) in place when a single page fails,
 * so a broken page never traps the user on a dead screen.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState error={error} reset={reset} />;
}
