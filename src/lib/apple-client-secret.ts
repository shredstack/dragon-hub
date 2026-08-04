import "server-only";
import { SignJWT, importPKCS8 } from "jose";

/**
 * Sign in with Apple's "client secret" is a JWT you sign yourself, and it
 * expires.
 *
 * This is the single most common way an Apple integration breaks months after
 * it ships: someone generates a secret by hand, pastes it into an env var, and
 * six months later — Apple's hard maximum — every sign-in starts failing with
 * `invalid_client`, long after anyone remembers doing it. Nothing warns you.
 *
 * So the secret is minted at runtime from the `.p8` key instead. There is
 * nothing to rotate and nothing to forget.
 *
 * Required environment:
 *   AUTH_APPLE_ID       The **Services ID** (e.g. net.shredstack.dragonhub.web),
 *                       NOT the bundle ID. Using the bundle ID here fails at
 *                       Apple's authorize endpoint with no useful message.
 *   APPLE_TEAM_ID       10-character Team ID.
 *   APPLE_KEY_ID        10-character Key ID of the Sign in with Apple key.
 *   APPLE_PRIVATE_KEY   Contents of the .p8 file, newlines as \n.
 */

const SIX_MONTHS_SECONDS = 15777000; // Apple's documented ceiling.
/** Re-mint an hour early so a request never races the expiry. */
const CACHE_TTL_MS = 55 * 60 * 1000;

let cached: { secret: string; expiresAt: number } | null = null;

export async function appleClientSecret(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.secret;

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.AUTH_APPLE_ID;
  const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !clientId || !privateKeyRaw) {
    throw new Error(
      "Sign in with Apple is not configured — AUTH_APPLE_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY are all required."
    );
  }

  // Vercel stores multi-line values with literal \n; a .p8 pasted directly has
  // real newlines. Accept both.
  const pkcs8 = privateKeyRaw.replace(/\\n/g, "\n");
  const key = await importPKCS8(pkcs8, "ES256");

  const now = Math.floor(Date.now() / 1000);
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + SIX_MONTHS_SECONDS)
    // Always this literal, for every Apple developer — it is Apple's token
    // endpoint, not your app.
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(key);

  cached = { secret, expiresAt: Date.now() + CACHE_TTL_MS };
  return secret;
}
