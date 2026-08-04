"use server";

import { after } from "next/server";
import {
  createDeletionRequest,
  consumeDeletionRequest,
  peekDeletionRequest,
} from "@/lib/account-deletion-requests";
import {
  deleteUserAndReleaseSeats,
  findLastBoardMembership,
} from "@/lib/account-deletion";
import { sendAccountDeletionEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/magic-link";
import {
  checkRateLimits,
  getClientIp,
  rateLimitMessage,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/utils";

/**
 * The signed-out deletion path, at `/account/delete`.
 *
 * Google Play's Data Safety form requires a deletion route that works without
 * installing the app; this is it. Every response below is deliberately the
 * same shape whether or not the address has an account — see
 * `createDeletionRequest`.
 */

export async function requestAccountDeletion(
  email: string
): Promise<{ ok: boolean; message: string }> {
  const normalized = email.trim().toLowerCase();

  // The generic answer, used for success, for "no such account", and for a
  // malformed address. Anything that varies with the address turns this page
  // into an account-existence oracle.
  const generic =
    "If that address has a DragonHub account, we've emailed a confirmation link. Check your inbox — including spam.";

  if (!isValidEmail(normalized)) {
    return { ok: true, message: generic };
  }

  const limit = await checkRateLimits([
    { rule: RATE_LIMITS.signupPerIp, subject: `ip:${await getClientIp()}` },
    {
      rule: RATE_LIMITS.deletionRequestPerEmail,
      subject: `email:${normalized}`,
    },
  ]);
  if (!limit.ok) {
    // The one case that does answer differently, and it has to: silently
    // dropping the request would leave someone tapping a button that appears
    // to work. It leaks nothing — the limit counts attempts, not accounts.
    return { ok: false, message: rateLimitMessage(limit) };
  }

  try {
    const request = await createDeletionRequest(normalized);
    if (request) {
      const url = `${getAppBaseUrl()}/account/delete/confirm?token=${encodeURIComponent(
        request.token
      )}`;
      // `after()`, not `await`: the response has to be indistinguishable from
      // the "no such account" one, and an outbound Resend call on this branch
      // alone makes it hundreds of milliseconds slower than the indexed SELECT
      // on the other. A stopwatch is as good an oracle as an error message.
      after(async () => {
        try {
          await sendAccountDeletionEmail({
            to: normalized,
            name: request.name,
            url,
            expiresInHours: request.expiresInHours,
          });
        } catch (error) {
          console.error("Account deletion email failed:", error);
        }
      });
    }
  } catch (error) {
    // Logged, not surfaced. A failure that produced a different message here
    // would be the same oracle by another route.
    console.error("Account deletion request failed:", error);
  }

  return { ok: true, message: generic };
}

export interface DeletionConfirmInfo {
  email: string;
  name: string | null;
  /** Named school when the last-board-member rule blocks this deletion. */
  blockedSchool: string | null;
}

/** What the confirm page shows, without consuming the token. */
export async function getDeletionConfirmInfo(
  token: string
): Promise<DeletionConfirmInfo | null> {
  const request = await peekDeletionRequest(token);
  if (!request) return null;

  const blocked = await findLastBoardMembership(request.userId);
  return {
    email: request.email,
    name: request.name,
    blockedSchool: blocked?.schoolName ?? null,
  };
}

/** The final button press. */
export async function confirmAccountDeletion(
  token: string
): Promise<{ ok: boolean; error?: string }> {
  // Re-checked here, not just on the page: the confirm page may have been open
  // for an hour, and the other board member may have left in the meantime.
  const info = await peekDeletionRequest(token);
  if (!info) {
    return {
      ok: false,
      error: "That link has expired or has already been used.",
    };
  }

  const blocked = await findLastBoardMembership(info.userId);
  if (blocked) {
    // Surfaced as something the person can act on, rather than a silent
    // failure — they cannot fix this alone, so the message says who can.
    return {
      ok: false,
      error: `You're the only PTA board member at ${blocked.schoolName}. Ask your PTA board to add another board member first — the school can't be administered without one.`,
    };
  }

  const consumed = await consumeDeletionRequest(token);
  if (!consumed) {
    return {
      ok: false,
      error: "That link has expired or has already been used.",
    };
  }

  await deleteUserAndReleaseSeats({
    userId: consumed.userId,
    actorId: consumed.userId,
  });

  return { ok: true };
}
