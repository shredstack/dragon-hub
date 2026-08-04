import "server-only";
import { db, dbPool } from "@/lib/db";
import { accountLinkRequests, accounts, users } from "@/lib/db/schema";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { linkVolunteerSignupsToUser } from "@/lib/volunteer-linking";
import { linkCommitteeSignupsToUser } from "@/lib/committee-onboarding";
import { linkEventPlanInvitesToUser } from "@/lib/event-plan-invites";
import { isPrivateRelayAddress } from "@/lib/account-merge-shared";

/**
 * Joining a Private Relay account to the account the school already knows.
 *
 * See `account-merge-shared.ts` for why this exists at all. The short version:
 * DragonHub is email-keyed, Apple's Hide My Email hands us an address that
 * matches nothing, and Apple does not let an app refuse it.
 *
 * The direction of the merge is deliberate and one-way: **the relay account is
 * absorbed into the real one, never the reverse.** The real account is the one
 * carrying the school membership, the classroom rows, the volunteer hours and
 * the message history; the relay account is minutes old and carries an
 * `accounts` row. Moving the small thing onto the big one is the only version
 * of this that cannot lose data.
 */

const LINK_TTL_HOURS = 24;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Record a claim and return the raw token for the emailed link.
 *
 * Deliberately does **not** reveal whether `targetEmail` has an account. The
 * caller always tells the user "check that inbox", so this endpoint cannot be
 * used to test which of a school's parents are registered.
 */
export async function createAccountLinkRequest(params: {
  relayUserId: string;
  targetEmail: string;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await db.insert(accountLinkRequests).values({
    relayUserId: params.relayUserId,
    targetEmail: params.targetEmail.trim().toLowerCase(),
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + LINK_TTL_HOURS * 3600 * 1000),
  });

  return token;
}

export type MergeFailureReason =
  | "invalid_token"
  | "no_target_account"
  | "same_account";

export type MergeResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: MergeFailureReason };

/** What a token stands for, resolved but not yet acted on. */
interface ResolvedLink {
  relayUserId: string;
  relayEmail: string;
  targetUserId: string;
  targetEmail: string;
}

/**
 * Resolve a token to the two accounts it would join, checking everything that
 * can be checked without writing anything.
 *
 * Shared by the preview and the confirmation so the page cannot show one
 * verdict and the button apply a different one.
 */
async function resolveLink(params: {
  relayUserId: string;
  targetEmail: string;
}): Promise<
  { ok: true; link: ResolvedLink } | { ok: false; reason: MergeFailureReason }
> {
  const [relayUser, targetUser] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, params.relayUserId),
      columns: { id: true, email: true, name: true },
    }),
    db.query.users.findFirst({
      where: eq(users.email, params.targetEmail),
      columns: { id: true, email: true, name: true },
    }),
  ]);

  if (!relayUser) return { ok: false, reason: "invalid_token" };
  if (!targetUser?.email) return { ok: false, reason: "no_target_account" };
  if (targetUser.id === relayUser.id) {
    return { ok: false, reason: "same_account" };
  }

  // Hard guard. Merging is destructive of the source account, so it may only
  // ever consume a relay address — never an ordinary one. Without this, a bug
  // that mis-populated `relay_user_id` would silently delete a real account.
  if (!isPrivateRelayAddress(relayUser.email)) {
    console.error(
      `Refusing merge: source ${relayUser.id} is not a Private Relay address`
    );
    return { ok: false, reason: "invalid_token" };
  }

  return {
    ok: true,
    link: {
      relayUserId: relayUser.id,
      relayEmail: relayUser.email,
      targetUserId: targetUser.id,
      targetEmail: targetUser.email,
    },
  };
}

export type LinkPreview =
  | { ok: true; targetEmail: string; relayEmail: string }
  | { ok: false; reason: MergeFailureReason };

/**
 * What the token would do, **without consuming it**.
 *
 * The merge deletes an account, so it may not happen on a page load. Mail
 * security products (Safe Links, Proofpoint — routine at a school district)
 * fetch every URL in an inbound message; a merge that ran during `GET` would
 * be performed by the scanner, burn the single-use token, and leave the parent
 * reading "that link has expired" about something that already happened.
 *
 * Same split, for the same reason, as `peekDeletionRequest` /
 * `consumeDeletionRequest`.
 */
export async function peekAccountLink(token: string): Promise<LinkPreview> {
  const request = await db.query.accountLinkRequests.findFirst({
    where: and(
      eq(accountLinkRequests.tokenHash, hash(token)),
      isNull(accountLinkRequests.consumedAt),
      sql`${accountLinkRequests.expiresAt} > now()`
    ),
    columns: { relayUserId: true, targetEmail: true },
  });

  if (!request) return { ok: false, reason: "invalid_token" };

  const resolved = await resolveLink(request);
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    targetEmail: resolved.link.targetEmail,
    relayEmail: resolved.link.relayEmail,
  };
}

/**
 * Redeem the emailed token and perform the merge.
 *
 * Possession of the token proves the target address, because the token only
 * ever went to that inbox. That is the guard the whole flow rests on, so it is
 * checked before anything is written — and consumed atomically, so a link
 * forwarded to a group inbox cannot be used twice.
 *
 * Only ever called from the explicit confirmation button; see
 * `peekAccountLink` for why nothing here may run on a page load.
 */
export async function redeemAccountLink(token: string): Promise<MergeResult> {
  const [request] = await db
    .update(accountLinkRequests)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(accountLinkRequests.tokenHash, hash(token)),
        isNull(accountLinkRequests.consumedAt),
        sql`${accountLinkRequests.expiresAt} > now()`
      )
    )
    .returning({
      relayUserId: accountLinkRequests.relayUserId,
      targetEmail: accountLinkRequests.targetEmail,
    });

  if (!request) return { ok: false, reason: "invalid_token" };

  const resolved = await resolveLink(request);
  if (!resolved.ok) return resolved;

  const { targetUserId, targetEmail } = resolved.link;

  await mergeRelayAccountInto(resolved.link.relayUserId, targetUserId);

  // Re-run the three linkers against the target address, because the relay
  // account never matched any of them. This is what actually puts the parent
  // back on their classroom, their committees and their event invitations.
  for (const link of [
    linkVolunteerSignupsToUser,
    linkCommitteeSignupsToUser,
    linkEventPlanInvitesToUser,
  ]) {
    try {
      await link(targetUserId, targetEmail);
    } catch (error) {
      // A failed linker is recoverable — they sign in again and the `signIn`
      // event re-runs it — whereas a thrown error here would leave the merge
      // half-done with no session.
      console.error("Post-merge linking failed:", error);
    }
  }

  return { ok: true, userId: targetUserId, email: targetEmail };
}

/**
 * Move the Apple identity onto the real account, then delete the orphan.
 *
 * `accounts` is keyed on `(provider, providerAccountId)`, so a straight UPDATE
 * of `user_id` is enough — and is what makes the next "Sign in with Apple"
 * land on the real account. If the target somehow already has an Apple row,
 * the relay's is dropped rather than fought over: two Apple identities on one
 * user is not a state the adapter can express.
 *
 * The identity move and the deletion of the source account are **one
 * transaction** (`dbPool`, the WebSocket driver — the HTTP one cannot hold
 * one). Torn apart, a dropped connection between them leaves an account whose
 * Apple identity now points elsewhere and which nobody can sign into, and the
 * token that would have finished the job is already consumed.
 */
async function mergeRelayAccountInto(
  relayUserId: string,
  targetUserId: string
): Promise<void> {
  // Outside the transaction, and first — exactly as `deleteUserAndReleaseSeats`
  // documents. Each deactivation ends in a promotion sweep that takes a row
  // lock and emails whoever moves up, so nesting it here would deadlock. A
  // relay account is minutes old and normally holds no seat at all; this is
  // the CLAUDE.md rule ("anything that ends someone's participation releases
  // their seats") honoured for the case where it somehow does.
  const { releaseSignupSeatsForUser } = await import("@/lib/signup-seats");
  await releaseSignupSeatsForUser({
    userId: relayUserId,
    removedBy: targetUserId,
  });

  await dbPool.transaction(async (tx) => {
    const relayAccounts = await tx
      .select({
        provider: accounts.provider,
        providerAccountId: accounts.providerAccountId,
      })
      .from(accounts)
      .where(eq(accounts.userId, relayUserId));

    for (const acc of relayAccounts) {
      const existing = await tx.query.accounts.findFirst({
        where: and(
          eq(accounts.userId, targetUserId),
          eq(accounts.provider, acc.provider)
        ),
        columns: { provider: true },
      });

      if (existing) {
        await tx
          .delete(accounts)
          .where(
            and(
              eq(accounts.provider, acc.provider),
              eq(accounts.providerAccountId, acc.providerAccountId)
            )
          );
      } else {
        await tx
          .update(accounts)
          .set({ userId: targetUserId })
          .where(
            and(
              eq(accounts.provider, acc.provider),
              eq(accounts.providerAccountId, acc.providerAccountId)
            )
          );
      }
    }

    // Carry over a name if the real account never had one — Apple supplies it
    // on first authorization and the magic-link path often does not.
    const [relayUser, targetUser] = await Promise.all([
      tx.query.users.findFirst({
        where: eq(users.id, relayUserId),
        columns: { name: true },
      }),
      tx.query.users.findFirst({
        where: eq(users.id, targetUserId),
        columns: { name: true },
      }),
    ]);
    if (!targetUser?.name?.trim() && relayUser?.name?.trim()) {
      await tx
        .update(users)
        .set({ name: relayUser.name })
        .where(eq(users.id, targetUserId));
    }

    // Every remaining FK to the relay account is cascade or set-null (see the
    // comment above `users` in schema.ts), so one statement resolves the graph.
    await tx.delete(users).where(eq(users.id, relayUserId));
  });
}

/** Housekeeping, from the daily cron — the same sweep the sibling token tables get. */
export async function pruneAccountLinkRequests(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const deleted = await db
    .delete(accountLinkRequests)
    .where(lt(accountLinkRequests.createdAt, cutoff))
    .returning({ id: accountLinkRequests.id });
  return deleted.length;
}
