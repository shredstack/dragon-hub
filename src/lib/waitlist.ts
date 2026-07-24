/**
 * The query side of a waitlist, shared by every table that has one.
 *
 * `committee_signups` and `volunteer_signups` are different tables with
 * different capacity rules, but the *line* behaves identically in both: order
 * by `waitlisted_at`, nulls last, 1-based position, scoped to whatever the seat
 * is counted against (a committee, a classroom). That rule is subtle enough —
 * and load-bearing enough — that it lives here once rather than in each module.
 *
 * The words a parent reads live in [waitlist-shared.ts]; the promotion email
 * lives in [volunteer-onboarding.ts] next to the welcome email it reuses.
 *
 * Deliberately not a "use server" module: these are helpers called from
 * NextAuth events and from inside transactions, not server actions.
 */

import { db, dbPool } from "@/lib/db";
import { and, count, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/** Any drizzle handle — the real `db`, or a transaction. */
export type DbLike = typeof db | Parameters<Parameters<typeof dbPool.transaction>[0]>[0];

/**
 * A backstop on how many rows one promotion sweep will move. Nothing legitimate
 * comes near it; it exists so that flipping a committee from capped to open, or
 * raising a limit on a school with a corrupted queue, can't turn into an
 * unbounded write inside a row lock.
 */
export const WAITLIST_SWEEP_LIMIT = 1000;

/**
 * 1-based place in line. Ordered by `waitlistedAt`, never by `createdAt`, so a
 * volunteer who was removed and later re-joined goes to the back rather than
 * to the position their original signup would have earned them.
 *
 * `scope` narrows the line to whatever the seat is counted against — one
 * committee, or one classroom within a per-classroom committee. Without it a
 * Room 12 volunteer would be told they're #7 because Room 8 has six people
 * waiting for seats that will never be theirs.
 */
export async function waitlistPositionIn(params: {
  tx: DbLike;
  table: PgTable;
  statusColumn: PgColumn;
  waitlistedAtColumn: PgColumn;
  waitlistedAt: Date | null;
  scope?: (SQL | undefined)[];
}): Promise<number> {
  const { tx, table, statusColumn, waitlistedAtColumn, waitlistedAt } = params;
  // A waitlisted row with no timestamp can't be placed against anyone, and
  // saying "#1" is kinder than saying nothing. `waitlistQueueOrder` keeps such
  // a row at the back of the actual queue, so this never promotes it early.
  if (!waitlistedAt) return 1;

  const [row] = await tx
    .select({ ahead: count() })
    .from(table)
    .where(
      and(
        sql`${statusColumn} = 'waitlisted'`,
        sql`${waitlistedAtColumn} < ${waitlistedAt}`,
        ...(params.scope ?? [])
      )
    );

  return (row?.ahead ?? 0) + 1;
}

/**
 * The ORDER BY every promotion sweep uses. Nulls last so a row missing its
 * timestamp can never cut the line.
 */
export function waitlistQueueOrder(waitlistedAtColumn: PgColumn): SQL {
  return sql`${waitlistedAtColumn} ASC NULLS LAST`;
}
