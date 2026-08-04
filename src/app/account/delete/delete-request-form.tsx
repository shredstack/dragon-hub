"use client";

import { useState } from "react";
import { requestAccountDeletion } from "@/actions/account-deletion-web";

export function DeleteRequestForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      setResult(await requestAccountDeletion(email));
    } catch {
      setResult({
        ok: false,
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  // On success the form is replaced entirely. Leaving it on screen invites a
  // second submission, and the response is identical either way — so a second
  // attempt only ever produces the same message and more confusion.
  if (result?.ok) {
    return (
      <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
        {result.message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {result && !result.ok && (
        <p className="text-sm text-red-600">{result.message}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
      >
        {busy ? "Sending..." : "Email me a deletion link"}
      </button>
    </form>
  );
}
