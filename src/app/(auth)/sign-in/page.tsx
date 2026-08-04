import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";
import { DemoSignInForm } from "./demo-sign-in-form";
import {
  isAppleAuthConfigured,
  isDemoLoginConfigured,
  isGoogleAuthConfigured,
} from "@/lib/auth-providers";
import { isNativeShell } from "@/lib/native-shell";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const googleEnabled = isGoogleAuthConfigured();
  const appleEnabled = isAppleAuthConfigured();

  // Both halves are resolved here, on the server. A normal load renders no
  // demo markup at all, rather than markup hidden with CSS — the branch does
  // not exist in the bundle a parent receives.
  const showDemo = params.demo === "1" && isDemoLoginConfigured();

  // Relative paths only — an absolute callbackUrl here would be an open
  // redirect. Same rule as `sign-in-form.tsx`.
  const requested = params.callbackUrl;
  const callbackUrl =
    requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/dashboard";

  if (showDemo) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Sign in to DragonHub</h2>
        <DemoSignInForm callbackUrl={callbackUrl} />
      </div>
    );
  }

  // Google refuses OAuth inside an embedded WebView (`disallowed_useragent`),
  // so the native shell routes it through the system browser instead. See
  // `src/lib/native-session.ts` for why that needs a handoff at all.
  const native = await isNativeShell();
  const hasOAuth = googleEnabled || appleEnabled;

  return (
    <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-2 text-xl font-semibold">Welcome to DragonHub</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {hasOAuth
          ? "Sign in or create an account. Every option reaches the same account, so you can switch between them anytime."
          : "Enter your email to sign in or create an account. We'll send you a magic link."}
      </p>
      {/* useSearchParams needs a suspense boundary to keep this page static. */}
      <Suspense fallback={null}>
        <SignInForm
          googleEnabled={googleEnabled}
          appleEnabled={appleEnabled}
          native={native}
        />
      </Suspense>

      {/* Signing in here can create the account, so this is the last screen
          before someone becomes a user — the policies have to be reachable
          from it without an account, which is why both are public routes. */}
      <p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        By continuing you agree to our{" "}
        <a href="/terms" className="underline underline-offset-2">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
