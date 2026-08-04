import "server-only";
import { db } from "@/lib/db";
import { accountDeletionRequests, users } from "@/lib/db/schema";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";

/**
 * The signed-out deletion path's token.
 *
 * Google Play's Data Safety form requires a deletion route reachable **without
 * installing the app**, which means a link mailed to an address that may or may
 * not have an account.
 *
 * Deliberately not `createSignInLink()`. That mints a real session, and "click
 * here to delete your account" that silently signs you in is a strictly worse
 * thing than what it claims to be — it turns a deletion email into a
 * credential. This token can do exactly one thing.
 */

const TTL_HOURS = 1;

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a request for `email`, or return null if no such account exists.
 *
 * The caller must respond identically either way. A deletion form that says
 * "no account found" is an account-existence oracle for every parent address
 * at the school, available to anyone who can load a public page.
 */
export async function createDeletionRequest(email: string): Promise<{
  token: string;
  name: string | null;
  expiresInHours: number;
} | null> {
  const normalized = email.trim().toLowerCase();
  const user = await db.query.users.findFirst({
    where: eq(users.email, normalized),
    columns: { id: true, name: true },
  });
  if (!user) return null;

  const token = randomBytes(32).toString("base64url");
  await db.insert(accountDeletionRequests).values({
    userId: user.id,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
  });

  return { token, name: user.name, expiresInHours: TTL_HOURS };
}

/**
 * Who a token stands for, without consuming it.
 *
 * The confirm page has to show what will be deleted *before* the final button
 * press, so the token must survive being looked at. Consumption happens in
 * `consumeDeletionRequest` at the moment of the actual delete.
 */
export async function peekDeletionRequest(
  token: string
): Promise<{ userId: string; email: string; name: string | null } | null> {
  const row = await db.query.accountDeletionRequests.findFirst({
    where: and(
      eq(accountDeletionRequests.tokenHash, hash(token)),
      isNull(accountDeletionRequests.consumedAt),
      sql`${accountDeletionRequests.expiresAt} > now()`
    ),
    columns: { userId: true },
  });
  if (!row) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
    columns: { id: true, email: true, name: true },
  });
  if (!user) return null;

  return { userId: user.id, email: user.email, name: user.name };
}

/**
 * Burn the token and return the user it stood for.
 *
 * Atomic — `UPDATE … WHERE consumed_at IS NULL RETURNING` — so a link opened
 * twice (a mail client prefetching it, a forwarded message) cannot delete
 * twice, and more importantly cannot half-delete.
 */
export async function consumeDeletionRequest(
  token: string
): Promise<{ userId: string } | null> {
  const [row] = await db
    .update(accountDeletionRequests)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(accountDeletionRequests.tokenHash, hash(token)),
        isNull(accountDeletionRequests.consumedAt),
        sql`${accountDeletionRequests.expiresAt} > now()`
      )
    )
    .returning({ userId: accountDeletionRequests.userId });

  return row ?? null;
}

/** Housekeeping, from the daily cron. */
export async function pruneDeletionRequests(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const deleted = await db
    .delete(accountDeletionRequests)
    .where(lt(accountDeletionRequests.createdAt, cutoff))
    .returning({ id: accountDeletionRequests.id });
  return deleted.length;
}
