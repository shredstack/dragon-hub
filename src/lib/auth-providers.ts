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
