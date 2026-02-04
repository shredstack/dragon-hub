import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-2 text-xl font-semibold">Welcome to Dragon Hub</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Enter your email to sign in or create an account. We&apos;ll send you a magic link.
      </p>
      <SignInForm />
    </div>
  );
}
