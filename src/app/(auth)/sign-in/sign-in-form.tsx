"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

/** Google's mark, inlined — the button may render before any network is up. */
function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Apple's mark, inlined. Apple's Human Interface Guidelines govern this button
 * precisely: the exact wording "Sign in with Apple", their logo, black or
 * white, and a corner radius matching the other buttons. A non-compliant
 * button is itself a 4.8 rejection — which is the guideline this whole
 * provider exists to satisfy, so getting the button wrong would be a
 * self-inflicted wound.
 */
function AppleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

export function SignInForm({
  googleEnabled,
  appleEnabled,
  native,
}: {
  googleEnabled: boolean;
  appleEnabled: boolean;
  /**
   * True inside the Capacitor shell. OAuth then runs in the system browser and
   * comes back through a one-time ticket, because Google refuses OAuth in an
   * embedded WebView and the browser's cookie jar is not the WebView's.
   */
  native: boolean;
}) {
  const searchParams = useSearchParams();
  // Someone sent here from an invitation should land back on it, not on the
  // dashboard with no idea what they were accepting. Relative paths only —
  // an absolute URL here would make this an open redirect.
  const requested = searchParams.get("callbackUrl");
  const callbackUrl =
    requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(
    null
  );

  async function startOAuth(provider: "google" | "apple") {
    setOauthLoading(provider);
    if (native) {
      const { startNativeOAuth } = await import(
        "@/components/mobile/native-auth"
      );
      const started = await startNativeOAuth(provider);
      // If the system browser could not be opened, fall through to the normal
      // redirect rather than leaving the button spinning forever.
      if (started) return;
    }
    // Full-page redirect to the provider; no need to clear the flag.
    signIn(provider, { callbackUrl });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("resend", { email, callbackUrl });
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {/* Apple first. Guideline 4.8 asks for equivalent prominence, and on iOS
          — which is where the guideline is enforced — the platform option
          being top is what a reviewer expects to see. */}
      {appleEnabled && (
        <button
          type="button"
          onClick={() => startOAuth("apple")}
          disabled={!!oauthLoading || loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
        >
          <AppleMark />
          {oauthLoading === "apple" ? "Redirecting..." : "Sign in with Apple"}
        </button>
      )}
      {googleEnabled && (
        <button
          type="button"
          onClick={() => startOAuth("google")}
          disabled={!!oauthLoading || loading}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <GoogleMark />
          {oauthLoading === "google" ? "Redirecting..." : "Sign in with Google"}
        </button>
      )}
      {(googleEnabled || appleEnabled) && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}
      <SignInEmailFields
        email={email}
        setEmail={setEmail}
        loading={loading}
        disabled={!!oauthLoading}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function SignInEmailFields({
  email,
  setEmail,
  loading,
  disabled,
  onSubmit,
}: {
  email: string;
  setEmail: (value: string) => void;
  loading: boolean;
  disabled: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        type="submit"
        disabled={loading || disabled}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send Magic Link"}
      </button>
    </form>
  );
}
