import "server-only";
import { db } from "@/lib/db";
import {
  reimbursementApprovals,
  reimbursementReceipts,
  reimbursementRequests,
  spendingCardRequests,
  users,
} from "@/lib/db/schema";
import { eq, or, sql } from "drizzle-orm";

/**
 * Keeping the money trail when the person leaves.
 *
 * Every other user reference in this app is `cascade` (the row only exists
 * because the user does) or `set null` (an authorship column the record can
 * survive losing). Reimbursements are neither. Who was paid, who signed for it,
 * and who photographed the receipt are *the record* — an auditor asking about a
 * check from three years ago is asking exactly those questions — so those three
 * columns are `restrict`, and a plain `DELETE FROM users` would fail.
 *
 * The answer is anonymization rather than deletion or cascade: the rows are
 * repointed at one shared placeholder account, so the request, its approvals and
 * its receipts all survive with their amounts, dates and check numbers intact,
 * and the person's identity does not. `payee_name` keeps whatever was typed on
 * the request itself, which is what the check was actually made out to and is
 * therefore part of the financial record rather than account data.
 */

/** The one account every departed submitter's history is filed under. */
const PLACEHOLDER_EMAIL = "deleted-account@dragonhub.invalid";
const PLACEHOLDER_NAME = "Deleted account";

/**
 * Does this user appear anywhere a `restrict` constraint would block their
 * deletion? Cheap enough to ask before doing anything, and it means an ordinary
 * account deletion — the overwhelming majority — never creates the placeholder.
 */
export async function hasReimbursementRecords(
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(reimbursementRequests)
    .where(eq(reimbursementRequests.submittedBy, userId))
    .limit(1);
  if (row) return true;

  const [receipt] = await db
    .select({ one: sql<number>`1` })
    .from(reimbursementReceipts)
    .where(eq(reimbursementReceipts.uploadedBy, userId))
    .limit(1);
  if (receipt) return true;

  const [approval] = await db
    .select({ one: sql<number>`1` })
    .from(reimbursementApprovals)
    .where(eq(reimbursementApprovals.approvedBy, userId))
    .limit(1);
  if (approval) return true;

  const [card] = await db
    .select({ one: sql<number>`1` })
    .from(spendingCardRequests)
    .where(eq(spendingCardRequests.requestedBy, userId))
    .limit(1);
  return !!card;
}

/**
 * Move this user's reimbursement history onto the placeholder account, so the
 * account row can then be deleted.
 *
 * Idempotent, and a no-op for the common case of someone with no history.
 */
export async function anonymizeReimbursementRecords(
  userId: string
): Promise<void> {
  if (!(await hasReimbursementRecords(userId))) return;
  const placeholderId = await getPlaceholderUserId();
  await reassignReimbursementRecords(userId, placeholderId);
}

/**
 * Repoint every `restrict` reference from one account to another.
 *
 * Shared by anonymization (destination: the placeholder) and by the Private
 * Relay merge (destination: the real account). The merge case is the same
 * person, so it moves the history rather than anonymizing it.
 */
export async function reassignReimbursementRecords(
  fromUserId: string,
  toUserId: string
): Promise<void> {
  await db
    .update(reimbursementRequests)
    .set({ submittedBy: toUserId })
    .where(eq(reimbursementRequests.submittedBy, fromUserId));

  await db
    .update(reimbursementReceipts)
    .set({ uploadedBy: toUserId })
    .where(eq(reimbursementReceipts.uploadedBy, fromUserId));

  // A pre-funded card is money the PTA handed to a named person; who that was
  // is as much a part of the record as who a check was written to.
  await db
    .update(spendingCardRequests)
    .set({ requestedBy: toUserId })
    .where(eq(spendingCardRequests.requestedBy, fromUserId));

  // `(request_id, role)` is unique, so a request the departing account and the
  // destination account both signed — impossible today, since a person holds
  // one board position, but cheap to survive — would collide. Drop the loser
  // rather than fail the deletion: the surviving row still records that the
  // role signed, which is what the constraint exists to say.
  const approvals = await db
    .select({
      id: reimbursementApprovals.id,
      requestId: reimbursementApprovals.requestId,
      role: reimbursementApprovals.role,
      approvedBy: reimbursementApprovals.approvedBy,
    })
    .from(reimbursementApprovals)
    .where(
      or(
        eq(reimbursementApprovals.approvedBy, fromUserId),
        eq(reimbursementApprovals.approvedBy, toUserId)
      )
    );

  // The destination's own rows are walked first so they win the key.
  approvals.sort((a) => (a.approvedBy === toUserId ? -1 : 1));

  const seen = new Set<string>();
  for (const approval of approvals) {
    const key = `${approval.requestId}:${approval.role}`;
    if (seen.has(key)) {
      if (approval.approvedBy === fromUserId) {
        await db
          .delete(reimbursementApprovals)
          .where(eq(reimbursementApprovals.id, approval.id));
      }
      continue;
    }
    seen.add(key);
    if (approval.approvedBy === fromUserId) {
      await db
        .update(reimbursementApprovals)
        .set({ approvedBy: toUserId })
        .where(eq(reimbursementApprovals.id, approval.id));
    }
  }
}

/**
 * The placeholder account, created on first need.
 *
 * `@dragonhub.invalid` is deliberate: `.invalid` is reserved by RFC 2606 and
 * can never resolve, so nothing can accidentally email this row, and no real
 * sign-in can ever land on it.
 */
async function getPlaceholderUserId(): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, PLACEHOLDER_EMAIL),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({ name: PLACEHOLDER_NAME, email: PLACEHOLDER_EMAIL })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (created) return created.id;

  // Lost a race with a concurrent deletion; the row exists now.
  const row = await db.query.users.findFirst({
    where: eq(users.email, PLACEHOLDER_EMAIL),
    columns: { id: true },
  });
  if (!row) throw new Error("Could not resolve the anonymized-account row");
  return row.id;
}
