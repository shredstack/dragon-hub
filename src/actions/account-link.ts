"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertAuthenticated } from "@/lib/auth-helpers";
import { createAccountLinkRequest } from "@/lib/account-merge";
import { isPrivateRelayAddress } from "@/lib/account-merge-shared";
import { sendAccountLinkEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/magic-link";
import {
  checkRateLimits,
  getClientIp,
  rateLimitMessage,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/utils";

/**
 * "The email address my school has for me is…" — the Private Relay claim.
 *
 * See `src/lib/account-merge-shared.ts` for why this flow exists.
 */
export async function requestAccountLink(
  targetEmail: string
): Promise<{ ok: boolean; message: string }> {
  const user = await assertAuthenticated();
  const normalized = targetEmail.trim().toLowerCase();

  const profile = await db.query.users.findFirst({
    where: eq(users.id, user.id!),
    columns: { email: true },
  });

  // Only a relay account may initiate a merge, because the merge deletes the
  // initiating account. Someone with an ordinary address who reached this page
  // is not in the situation it solves.
  if (!isPrivateRelayAddress(profile?.email)) {
    return {
      ok: false,
      message:
        "This is only for accounts created with Apple's Hide My Email option.",
    };
  }

  if (!isValidEmail(normalized)) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  if (normalized === profile?.email?.toLowerCase()) {
    return {
      ok: false,
      message: "That's the address you're already signed in with.",
    };
  }

  const limit = await checkRateLimits([
    { rule: RATE_LIMITS.signupPerIp, subject: `ip:${await getClientIp()}` },
    { rule: RATE_LIMITS.signupPerEmail, subject: `link:${normalized}` },
  ]);
  if (!limit.ok) return { ok: false, message: rateLimitMessage(limit) };

  // Sent regardless of whether an account exists at that address, and the
  // message below never says which — otherwise a signed-in relay account
  // becomes a way to enumerate every parent address at the school.
  try {
    const token = await createAccountLinkRequest({
      relayUserId: user.id!,
      targetEmail: normalized,
    });
    const targetExists = await db.query.users.findFirst({
      where: eq(users.email, normalized),
      columns: { id: true },
    });
    if (targetExists) {
      await sendAccountLinkEmail({
        to: normalized,
        url: `${getAppBaseUrl()}/link-account/confirm?token=${encodeURIComponent(token)}`,
        expiresInHours: 24,
      });
    }
  } catch (error) {
    console.error("Account link request failed:", error);
  }

  return {
    ok: true,
    message: `If ${normalized} has a DragonHub account, we've sent it a link. Open that email to finish connecting the two.`,
  };
}
