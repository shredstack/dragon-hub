/**
 * Which sign-in methods this deployment can actually offer.
 *
 * Google is optional: the app has to boot and stay signable-in on a preview
 * branch or a fresh clone that has no OAuth client, so the provider is
 * registered only when credentials exist and the sign-in page hides the button
 * in lockstep. Both sides read this one function so they can never disagree —
 * a visible button with no provider behind it is a 500 on click.
 *
 * Client-safe by construction: it returns a boolean, never the secret.
 */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

/**
 * Sign in with Apple. Same all-or-nothing shape as Google, but with four
 * variables rather than two, because Apple's "client secret" is a JWT this app
 * signs at runtime from a `.p8` key (see `apple-client-secret.ts`) rather than
 * a static string.
 *
 * `AUTH_APPLE_ID` is the **Services ID**, not the bundle ID — a mix-up that
 * fails at Apple's authorize endpoint with `invalid_client` and no other clue.
 */
export function isAppleAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_APPLE_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_PRIVATE_KEY
  );
}

/**
 * The App Store / Play reviewer's way in.
 *
 * Both stores reject an app whose content sits behind a login they cannot get
 * past, and DragonHub's only other door is a magic link to a school email
 * address — which a reviewer does not have. So this deployment can register a
 * Credentials provider bound to exactly one seeded account.
 *
 * Off unless BOTH variables are set, so a preview branch or a fresh clone has
 * no password door at all. The sign-in form reads the same function, so the
 * button and the provider can never disagree.
 */
export function isDemoLoginConfigured(): boolean {
  return Boolean(
    process.env.DEMO_LOGIN_EMAIL && process.env.DEMO_LOGIN_PASSWORD
  );
}
