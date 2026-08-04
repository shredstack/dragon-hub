"use server";

import { after } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertAuthenticated } from "@/lib/auth-helpers";
import {
  createAccountLinkRequest,
  redeemAccountLink,
  type MergeFailureReason,
} from "@/lib/account-merge";
import { createNativeSessionCookie } from "@/lib/native-session";
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

  // The message below never says whether an account exists at that address —
  // otherwise a signed-in relay account becomes a way to enumerate every parent
  // address at the school. The *timing* must not say so either, which is why
  // the send happens in `after()`: awaiting an outbound Resend call on the
  // "account exists" branch alone makes that branch measurably slower than the
  // indexed SELECT on the other, which is the same oracle by a stopwatch.
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
      after(async () => {
        try {
          await sendAccountLinkEmail({
            to: normalized,
            url: `${getAppBaseUrl()}/link-account/confirm?token=${encodeURIComponent(token)}`,
            expiresInHours: 24,
          });
        } catch (error) {
          console.error("Account link email failed:", error);
        }
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

/**
 * The final button press on `/link-account/confirm`.
 *
 * This is the only caller of `redeemAccountLink`, and it is deliberately an
 * action rather than something the page does while rendering: the merge
 * deletes an account, and a link-scanning mail filter fetching the emailed URL
 * would otherwise perform it — burning the one-time token before the parent
 * ever clicks, and telling them it expired.
 */
export async function confirmAccountLink(
  token: string
): Promise<
  { ok: true; email: string } | { ok: false; reason: MergeFailureReason }
> {
  const result = await redeemAccountLink(token);
  if (!result.ok) return result;

  // Sign them in as the target account. The relay account no longer exists, so
  // any session pointing at it is now invalid anyway.
  const cookie = await createNativeSessionCookie(result.userId);
  (await cookies()).set(cookie.name, cookie.value, cookie.options);

  return { ok: true, email: result.email };
}
