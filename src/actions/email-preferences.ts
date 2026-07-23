"use server";

import { assertAuthenticated } from "@/lib/auth-helpers";
import {
  getCommitteeDigestPreference,
  setCommitteeDigestPreference,
  setCommitteeDigestPreferenceForUser,
} from "@/lib/sync/committee-digest";
import { revalidatePath } from "next/cache";

/**
 * Unsubscribe from an emailed link, with no session.
 *
 * The token IS the authorization here — that's the point. It is random,
 * single-purpose (it can only flip email preferences), and reaches only the
 * inbox the email went to. Making someone sign in to stop email is how a digest
 * ends up marked as spam instead of switched off.
 */
export async function updateEmailPreferenceByToken(
  token: string,
  committeeDigest: boolean
): Promise<boolean> {
  return setCommitteeDigestPreference(token, committeeDigest);
}

/** The signed-in path, for the toggle on /profile. */
export async function updateMyEmailPreferences(committeeDigest: boolean) {
  const user = await assertAuthenticated();
  await setCommitteeDigestPreferenceForUser(user.id!, committeeDigest);
  revalidatePath("/profile");
}

export async function getMyEmailPreferences() {
  const user = await assertAuthenticated();
  return { committeeDigest: await getCommitteeDigestPreference(user.id!) };
}
