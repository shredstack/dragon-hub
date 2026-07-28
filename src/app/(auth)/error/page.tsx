import Link from "next/link";

/**
 * Auth.js reports failures by redirecting here with `?error=<code>`. The
 * default message assumed the only way to fail was an expired magic link;
 * with Google sign-in there are now failures that message would actively
 * mislead someone about, so the codes worth distinguishing get their own text.
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Our `signIn` callback refused a Google profile whose address Google
  // itself does not report as verified.
  AccessDenied:
    "We couldn't verify that email address with Google. Sign in with a magic link instead, or use a Google account with a confirmed email address.",
  // Shouldn't happen — the Google provider links by verified email — but if
  // linking is ever turned off, this is the code that appears.
  OAuthAccountNotLinked:
    "That email address is already registered. Sign in with a magic link instead.",
  Verification:
    "That magic link has expired or was already used. Request a new one below.",
  Configuration:
    "Sign-in is misconfigured on our end. Please let the PTA board know.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    (error ? ERROR_MESSAGES[error] : undefined) ??
    "There was a problem signing you in. The link may have expired.";

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
      <h2 className="mb-2 text-xl font-semibold text-destructive">Authentication Error</h2>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      <Link
        href="/sign-in"
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
      >
        Try Again
      </Link>
    </div>
  );
}
