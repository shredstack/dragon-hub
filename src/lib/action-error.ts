/**
 * Turning a failed server action into something a board member can act on.
 *
 * Client-safe (no `"use server"`, no DB imports) — it runs in the `catch` of a
 * client component that awaited a server action.
 *
 * The problem it solves: our server actions throw errors with deliberately
 * useful messages ("One or more committees are not part of this school"), and
 * in development those messages arrive at the client intact. **In a production
 * build Next.js replaces them**, to avoid leaking internals, with a fixed
 * generic string plus a `digest` — a hash that also appears in the Vercel log
 * line for the real error. So `error.message` alone is right half the time and
 * a dead end the other half, which is how a driver-level failure spent a
 * release showing up as "Failed to update article".
 *
 * `actionErrorMessage` therefore returns, in order of preference:
 *   1. the action's own message, when Next let it through;
 *   2. the caller's fallback plus the digest, when it didn't — so the person
 *      reporting the bug hands over the one string that finds it in the logs.
 */

/**
 * The messages Next.js substitutes for a redacted server-side error. Matched by
 * prefix because the Server Components variant continues into a paragraph about
 * digests, and the wording has moved between minor versions.
 */
const REDACTED_PREFIXES = [
  "An unexpected response was received from the server",
  "An error occurred in the Server Components render",
  "An error occurred in the Server Component render",
  "Failed to find Server Action",
];

/** Next attaches this to errors it redacted; it matches a line in the logs. */
function digestOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.length > 0 ? digest : null;
}

function isRedacted(message: string): boolean {
  return REDACTED_PREFIXES.some((prefix) => message.startsWith(prefix));
}

/**
 * A message to show the user for a failed server action.
 *
 * @param fallback What went wrong, in the caller's words, for when the real
 *   message didn't survive the server boundary. Write it as a full sentence
 *   about the user's action — "Couldn't save your changes." — since it is what
 *   they will usually read.
 */
export function actionErrorMessage(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim();

  if (message && !isRedacted(message)) return message;

  const digest = digestOf(error);
  return digest ? `${fallback} (reference: ${digest})` : fallback;
}
