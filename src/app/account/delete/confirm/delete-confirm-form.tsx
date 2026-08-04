"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { confirmAccountDeletion } from "@/actions/account-deletion-web";

export function DeleteConfirmForm({
  token,
  blockedSchool,
}: {
  token: string;
  blockedSchool: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surfaced as an explanation with a next step, rather than a button that
  // fails when pressed. The person cannot fix this alone, so the copy says who
  // can.
  if (blockedSchool) {
    return (
      <div className="mt-4 flex gap-3 rounded-md bg-amber-50 p-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-900">
          <p className="font-medium">
            You&apos;re the only PTA board member at {blockedSchool}.
          </p>
          <p className="mt-1">
            Deleting your account would leave the school with nobody who can
            administer it — including nobody who could appoint a replacement.
            Contact your PTA board to have another board member added first,
            then request deletion again.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
        Your account has been deleted. Thanks for helping out at your school.
      </p>
    );
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await confirmAccountDeletion(token);
    if (result.ok) setDone(true);
    else {
      setError(result.error ?? "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="w-full rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
      >
        {busy ? "Deleting..." : "Permanently delete my account"}
      </button>
      <Link
        href="/"
        className="block text-center text-sm text-muted-foreground hover:underline"
      >
        Cancel — keep my account
      </Link>
    </div>
  );
}
