import Link from "next/link";

export const metadata = { title: "Account deleted" };

/**
 * Where in-app deletion lands.
 *
 * A dedicated page rather than a redirect to `/sign-in`, which after deleting
 * your account reads as "that didn't work, try again".
 */
export default function GoodbyePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dragon-blue-500">DragonHub</h1>
        <h2 className="mt-6 text-lg font-semibold">Your account is deleted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything attached to it is gone, and any volunteer spots you held
          have been passed to whoever was next in line.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Thanks for the time you gave your school. If you ever come back, just
          sign up again with your school&apos;s code.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          Back to DragonHub
        </Link>
      </div>
    </div>
  );
}
