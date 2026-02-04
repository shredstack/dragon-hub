import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
      <h2 className="mb-2 text-xl font-semibold text-destructive">Authentication Error</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        There was a problem signing you in. The link may have expired.
      </p>
      <Link
        href="/sign-in"
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
      >
        Try Again
      </Link>
    </div>
  );
}
