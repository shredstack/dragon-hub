/**
 * Apple's Private Relay, and why it needs its own flow.
 *
 * Client-safe (no DB, no server-only) so the sign-in page, the profile banner
 * and the server merge can all ask the same question.
 *
 * ## The problem
 *
 * DragonHub's identity model is **email-keyed**. `volunteer_signups.email` and
 * `committee_signups.email` are how `linkVolunteerSignupsToUser` /
 * `linkCommitteeSignupsToUser` attach a new account to the school it belongs
 * to, and `getSchoolNameForEmail` brands the magic-link email off the same
 * lookup. The address is not a contact detail; it is the join key.
 *
 * A parent who picks **Hide My Email** during Sign in with Apple gets
 * `<random>@privaterelay.appleid.com`. That address matches no signup row, no
 * membership, no classroom. They land on an empty account with a join-code
 * wall, while their real account sits untouched under `sarah@gmail.com`.
 *
 * This is not an edge case — it is the default path for a privacy-minded user,
 * and Apple does not allow an app to disable the option. So the app has to
 * handle it: `/link-account` asks for "the email address your school has for
 * you", proves it with a magic link, and merges.
 */

export const PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com";

export function isPrivateRelayAddress(
  email: string | null | undefined
): boolean {
  return !!email && email.toLowerCase().endsWith(`@${PRIVATE_RELAY_DOMAIN}`);
}
