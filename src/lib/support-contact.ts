/**
 * Where someone writes when they need a human at DragonHub.
 *
 * These addresses are printed in the Privacy Policy, the Terms, and above the
 * submit button of every public signup form — i.e. in front of parents who have
 * no other way to reach us and, in the App Store's case, in front of a
 * reviewer. So they have to be addresses that a person actually reads. The
 * `support@` / `privacy@` aliases they replaced were never provisioned on the
 * shredstack.net domain and silently bounced.
 *
 * There is deliberately no lookup into `super_admins` here. That table says who
 * may administer the platform, not who answers mail, and half of these surfaces
 * (the consent block on public signup forms) render on the client where a
 * database is not reachable anyway. Hence `NEXT_PUBLIC_` — the value is public
 * by definition; it is printed on a public page.
 *
 * `PRIVACY_EMAIL` falls back to `SUPPORT_EMAIL` so the two can be split later —
 * a GDPR/CCPA request going to its own inbox is a reasonable thing to want —
 * without another pass over the legal pages.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "shredstacksarah@gmail.com";

export const PRIVACY_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_EMAIL || SUPPORT_EMAIL;
