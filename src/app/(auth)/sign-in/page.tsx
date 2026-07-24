import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-2 text-xl font-semibold">Welcome to Dragon Hub</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter your email to sign in or create an account. We&apos;ll send you a magic link.
      </p>
      {/* useSearchParams needs a suspense boundary to keep this page static. */}
      <Suspense fallback={null}>
        <SignInForm />
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
