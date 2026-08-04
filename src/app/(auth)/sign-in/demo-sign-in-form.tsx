"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/**
 * The App Store / Play reviewer's sign-in.
 *
 * Reachable only at `/sign-in?demo=1`, and rendered only when the deployment
 * actually has a demo account configured — both halves resolved on the server
 * and handed down as `enabled`, so on a normal load this component's markup
 * does not exist in the HTML for a curious parent to find in view-source.
 *
 * It is not hidden as a security measure — the account is deliberately
 * ordinary, seeded into a fictional school, and rate-limited in `authorize()`.
 * It is hidden because a password box on a magic-link app's sign-in page is a
 * support ticket from every family that tries to use it.
 */
export function DemoSignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("demo", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("That email and password didn't work.");
      setLoading(false);
      return;
    }
    // A full navigation, so the server sees the session cookie the sign-in
    // response just set.
    window.location.assign(callbackUrl);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/50 p-3">
        <p className="text-xs font-medium">Demo account</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          For app review. Signs in to a sample school with fictional families
          and made-up data.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="demo-email" className="mb-1 block text-sm font-medium">
            Email address
          </label>
          <input
            id="demo-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label
            htmlFor="demo-password"
            className="mb-1 block text-sm font-medium"
          >
            Password
          </label>
          <input
            id="demo-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
