import "server-only";
import { encode } from "next-auth/jwt";

/**
 * Minting an Auth.js session cookie for a user, outside Auth.js's own sign-in
 * flow.
 *
 * ## Why this has to exist
 *
 * Google returns `403: disallowed_useragent` for OAuth in an embedded WebView,
 * so the native shell must run sign-in in the system browser. But
 * SFSafariViewController and WKWebView do not share a cookie jar (nor do
 * Android Custom Tabs and the app's WebView), so the session cookie Auth.js
 * sets at the end of that flow lands somewhere the app cannot read. There is
 * no configuration that fixes this; it is the platforms working as designed.
 *
 * The way across is a one-time ticket handed back through a custom URL scheme
 * and redeemed by a `fetch` running *inside* the WebView — and redeeming it
 * means minting a session cookie by hand. Hence this module.
 *
 * ## Why it's only ~10 lines
 *
 * `session.strategy` is `jwt`, so a session *is* the encoded token in the
 * `dragonhub.session-token` cookie. There is no `sessions` row to create.
 * `encode` from `next-auth/jwt` produces exactly what the middleware's
 * `decode` accepts — provided the `salt` matches the cookie name, which is the
 * part that is easy to get wrong and produces no error, just an endless bounce
 * back to /sign-in.
 *
 * ⚠️ **This depends on Auth.js internals**, the same caveat
 * `src/lib/magic-link.ts` carries. Verified against next-auth 5.0.0-beta.30 /
 * @auth/core 0.41.1. Re-verify on upgrade: if the token shape or the salt
 * convention drifts, native sign-in silently produces a cookie the middleware
 * rejects, and the app bounces to /sign-in forever with nothing in the logs.
 */

/** Must match `cookies.sessionToken.name` in `src/lib/auth.ts`. */
export const SESSION_COOKIE_NAME = "dragonhub.session-token";

/** Matches Auth.js's own default session age. */
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The JWT payload `callbacks.jwt` produces.
 *
 * Extracted so that callback and this module cannot drift: a session minted
 * here with a field the rest of the app expects to be present would fail in
 * whatever reads it, far from the cause.
 */
export function sessionTokenPayload(userId: string) {
  return { id: userId, sub: userId };
}

export interface NativeSessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    path: "/";
    secure: boolean;
    maxAge: number;
  };
}

export async function createNativeSessionCookie(
  userId: string
): Promise<NativeSessionCookie> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");

  const value = await encode({
    token: sessionTokenPayload(userId),
    secret,
    // The salt IS the cookie name in Auth.js v5. A mismatch here produces a
    // token that encodes and decodes fine on its own and is rejected by the
    // middleware every time.
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return {
    name: SESSION_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      // Deliberately `lax`, matching `auth.ts`. The three OAuth checking
      // cookies are `none` for Apple's form-post; the session cookie is not,
      // and must not be.
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}
