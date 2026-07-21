import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { verificationTokens } from "@/lib/db/schema";

/**
 * Mint an Auth.js-compatible sign-in link without going through the sign-in page.
 *
 * Auth.js stores email verification tokens as sha256(`${token}${secret}`) and
 * re-hashes the token from the URL when `/api/auth/callback/<provider>` is hit
 * (see `@auth/core/lib/actions/signin/send-token.js` and
 * `@auth/core/lib/actions/callback/index.js`). Creating the row ourselves with
 * the same hashing lets us embed a working one-click login in an email we send
 * directly — e.g. the volunteer welcome email — so a new volunteer doesn't have
 * to request a second magic-link email just to get in.
 *
 * Tokens are single-use: the callback deletes the row when it's redeemed.
 *
 * ⚠️ UPGRADING AUTH.JS: this depends on Auth.js internals, so re-verify the
 * hashing whenever `next-auth` / `@auth/core` moves. Verified against
 * next-auth 5.0.0-beta.30 / @auth/core 0.41.1:
 *   - `@auth/core/lib/actions/signin/send-token.js:63` — stores
 *     `createHash(`${token}${secret}`)`
 *   - `@auth/core/lib/actions/callback/index.js:144` — looks the token up the
 *     same way on redemption
 *   - `@auth/core/lib/utils/web.js:75` — `createHash` is SHA-256, lowercase hex
 *   - `next-auth/lib/env.js:22` — secret resolves to
 *     `AUTH_SECRET ?? NEXTAUTH_SECRET`
 * If it drifts, links silently stop working: the callback just won't find a
 * matching row and sends the user to the sign-in page.
 */

// Longer than a normal magic link (24h) because welcome emails often sit unread
// for a day or two, but still short enough to limit the window of exposure.
const DEFAULT_EXPIRY_HOURS = 72;

// Must match the provider id in `src/lib/auth.ts`.
const EMAIL_PROVIDER_ID = "resend";

export function getAppBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  );
}

function hashToken(token: string): string {
  // Same precedence Auth.js uses when resolving the secret (next-auth/lib/env.js)
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET / NEXTAUTH_SECRET is not configured");
  }
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

interface CreateSignInLinkOptions {
  /** Where the user lands after the link signs them in. */
  callbackPath?: string;
  expiresInHours?: number;
}

/**
 * Returns a URL that signs `email` in and redirects to `callbackPath`.
 * Creates the user account on first use, exactly like a normal magic link.
 */
export async function createSignInLink(
  email: string,
  { callbackPath = "/dashboard", expiresInHours = DEFAULT_EXPIRY_HOURS }: CreateSignInLinkOptions = {}
): Promise<{ url: string; expires: Date; expiresInHours: number }> {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) {
    throw new Error("Cannot build a sign-in link without NEXTAUTH_URL or VERCEL_URL");
  }

  // The callback compares the `email` query param against the stored identifier,
  // so both must be the same normalized value.
  const identifier = email.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  await db.insert(verificationTokens).values({
    identifier,
    token: hashToken(token),
    expires,
  });

  const params = new URLSearchParams({
    callbackUrl: `${baseUrl}${callbackPath}`,
    token,
    email: identifier,
  });

  return {
    url: `${baseUrl}/api/auth/callback/${EMAIL_PROVIDER_ID}?${params}`,
    expires,
    expiresInHours,
  };
}
