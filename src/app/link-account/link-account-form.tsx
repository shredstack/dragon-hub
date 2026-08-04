"use client";

import { useState } from "react";
import { requestAccountLink } from "@/actions/account-link";

export function LinkAccountForm() {
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
      setResult(await requestAccountLink(email));
    } catch {
      setResult({
        ok: false,
        message: "Something went wrong. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

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
        <label htmlFor="target-email" className="mb-1 block text-sm font-medium">
          Your school email address
        </label>
        <input
          id="target-email"
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
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark disabled:opacity-50"
      >
        {busy ? "Sending..." : "Send me a confirmation link"}
      </button>
    </form>
  );
}
