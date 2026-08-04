"use client";

import { useState } from "react";
import Link from "next/link";
import { confirmAccountLink } from "@/actions/account-link";

/**
 * The explicit confirmation the merge is gated behind.
 *
 * Nothing is written until this button is pressed — see `peekAccountLink` for
 * why a page load must not be enough.
 */
export function LinkConfirmForm({
  token,
  targetEmail,
}: {
  token: string;
  targetEmail: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="mt-6">
        <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          You&apos;re all connected. Sign in with Apple now takes you straight
          to your DragonHub account at <strong>{targetEmail}</strong>, with your
          school, classrooms and committees where you left them.
        </p>
        {/* A real navigation, not `<Link>`: the action just swapped the session
            cookie out from under this page, and a client-side transition would
            carry the old relay session's RSC cache with it. */}
        <a
          href="/dashboard"
          className="bg-primary text-primary-foreground hover:bg-primary-dark mt-4 inline-block rounded-md px-4 py-2 text-sm font-medium"
        >
          Go to DragonHub
        </a>
      </div>
    );
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await confirmAccountLink(token);
      if (result.ok) {
        setDone(true);
        return;
      }
      setError(
        result.reason === "no_target_account"
          ? "We couldn't find a DragonHub account for that address anymore."
          : result.reason === "same_account"
            ? "That address is already this account. Nothing to do."
            : "That link has expired or has already been used. Nothing has changed on either account."
      );
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={busy}
        className="bg-primary text-primary-foreground hover:bg-primary-dark w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Connecting..." : "Connect these accounts"}
      </button>
      <Link
        href="/"
        className="text-muted-foreground block text-center text-sm hover:underline"
      >
        Cancel — leave both accounts as they are
      </Link>
    </div>
  );
}
