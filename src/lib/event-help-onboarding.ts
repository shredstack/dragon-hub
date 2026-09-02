/**
 * The line for a seat on an event's planning team.
 *
 * `src/lib/waitlist-shared.ts` opens by saying two features put parents in a
 * line "and a third will eventually". This is the third, and it deliberately
 * brings none of its own arithmetic: every string, every position calculation
 * and both admin presentations come from the existing waitlist modules. What
 * lives here is the one genuinely new thing — the promotion sweep — modelled
 * directly on `promoteFromCommitteeWaitlist`.
 *
 * It is a *sibling* of that function rather than a generalization of it, on
 * purpose. The committee sweep reasons about per-classroom limits, `maxSize`
 * and DLI partners; folding a fourth capacity model into it would make the one
 * piece of this system that is genuinely hard to reason about harder. Two
 * functions that read alike beat four capacity models in one.
 *
 * Deliberately not a "use server" module: these run inside server actions and
 * inside `releaseSignupSeatsForUser`, not from a form.
 */

import { db, dbPool } from "@/lib/db";
import {
  eventCatalog,
  eventHelpRequests,
  eventPlanMembers,
  eventPlans,
} from "@/lib/db/schema";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { notify } from "@/lib/notify";
import {
  waitlistPositionIn,
  waitlistQueueOrder,
  WAITLIST_SWEEP_LIMIT,
  type DbLike,
} from "@/lib/waitlist";
import type { CapacityState } from "@/lib/waitlist-shared";

/**
 * Seats taken on a plan's team.
 *
 * Counted over `event_plan_members`, the app's standing rule that the row *is*
 * the seat. **Placeholder rows count**: a committee chair the board assigned
 * who has no account yet is a person on the team, and a cap that ignored them
 * would seat one person too many.
 */
export async function countEventPlanSeats(
  tx: DbLike,
  eventPlanId: string
): Promise<number> {
  const [row] = await tx
    .select({ taken: count() })
    .from(eventPlanMembers)
    .where(eq(eventPlanMembers.eventPlanId, eventPlanId));
  return row?.taken ?? 0;
}

/**
 * The `CapacityState` for one event's team, or an uncapped one when the year
 * has no plan yet.
 *
 * `helpCap: null` means uncapped, which is never "full" — the same contract as
 * `committees.max_size` and `volunteer_settings.roomParentLimit`, so this drops
 * straight into `capacitySentence()` / `joinButtonLabel()` with no translation.
 */
export async function eventHelpCapacity(params: {
  eventPlanId: string | null;
  helpCap: number | null;
  helpWaitlistEnabled: boolean;
}): Promise<CapacityState> {
  const taken = params.eventPlanId
    ? await countEventPlanSeats(db, params.eventPlanId)
    : 0;
  return {
    taken,
    limit: params.helpCap,
    waitlistEnabled: params.helpWaitlistEnabled,
  };
}

/** 1-based place in one event's line, using the ordering rule every waitlist shares. */
export function eventHelpWaitlistPosition(
  tx: DbLike,
  row: { eventCatalogId: string; schoolYear: string; waitlistedAt: Date | null }
): Promise<number> {
  return waitlistPositionIn({
    tx,
    table: eventHelpRequests,
    statusColumn: eventHelpRequests.status,
    waitlistedAtColumn: eventHelpRequests.waitlistedAt,
    waitlistedAt: row.waitlistedAt,
    // Scoped to the event *and* the year: last year's line will never be
    // promoted into this year's team, so counting it would tell someone
    // they're #9 for a team with eight seats free.
    scope: [
      eq(eventHelpRequests.eventCatalogId, row.eventCatalogId),
      eq(eventHelpRequests.schoolYear, row.schoolYear),
    ],
  });
}

interface PromotedPerson {
  requestId: string;
  userId: string;
  schoolId: string;
  eventTitle: string;
  eventSlug: string;
}

/**
 * Fill open seats on a plan's team from its waitlist, oldest `waitlistedAt`
 * first, and tell each promoted parent.
 *
 * Promotion is automatic by design: a waitlist that needs a human to notice a
 * vacancy is just a list. The board or the lead can still promote out of order
 * by passing `requestId` — a parent who ran this event at their old school
 * shouldn't have to wait for three people to drop.
 *
 * Returns `{ promoted: number }`, which is exactly the contract
 * `WaitlistPanel.onPromote` already understands: `{ promoted: 0 }` means the
 * seat wasn't there, and the panel follows with `promoteOverCapacityCopy` and
 * calls again with `overCapacity: true` if the board says yes.
 */
export async function promoteFromEventHelpWaitlist(
  eventPlanId: string,
  options?: {
    requestId?: string;
    promotedBy?: string;
    /**
     * Seat this person even though the team is full.
     *
     * Requires `requestId`, which is the guard that matters: the automatic
     * sweep never passes one, so no configuration of this flag can make the cap
     * stop applying to the queue as a whole. Overruling a cap is a decision
     * about one named parent, and the roster then reads 9/8 and is correct.
     */
    overCapacity?: boolean;
  }
): Promise<{ promoted: number }> {
  const promoted = await dbPool.transaction(async (tx): Promise<PromotedPerson[]> => {
    const [plan] = await tx
      .select({
        id: eventPlans.id,
        schoolId: eventPlans.schoolId,
        schoolYear: eventPlans.schoolYear,
        eventCatalogId: eventPlans.eventCatalogId,
      })
      .from(eventPlans)
      .where(eq(eventPlans.id, eventPlanId))
      .for("update");

    // A one-off plan has no catalog entry, so nobody can have asked to help
    // with it from Our Events — only catalog entries appear there.
    if (!plan?.eventCatalogId || !plan.schoolId) return [];

    const [entry] = await tx
      .select({
        id: eventCatalog.id,
        title: eventCatalog.title,
        slug: eventCatalog.slug,
        helpCap: eventCatalog.helpCap,
      })
      .from(eventCatalog)
      .where(eq(eventCatalog.id, plan.eventCatalogId));
    if (!entry) return [];

    const overCapacity = !!options?.overCapacity && !!options.requestId;

    const taken = await countEventPlanSeats(tx, eventPlanId);
    // Uncapped is never full, so every leftover waitlist row from a cap that
    // has since been lifted is promotable at once.
    const seats =
      entry.helpCap === null ? Number.MAX_SAFE_INTEGER : entry.helpCap - taken;
    if (!overCapacity && seats <= 0) return [];

    const queue = await tx
      .select()
      .from(eventHelpRequests)
      .where(
        and(
          eq(eventHelpRequests.eventCatalogId, entry.id),
          eq(eventHelpRequests.schoolYear, plan.schoolYear),
          eq(eventHelpRequests.status, "waitlisted"),
          ...(options?.requestId
            ? [eq(eventHelpRequests.id, options.requestId)]
            : [])
        )
      )
      .orderBy(waitlistQueueOrder(eventHelpRequests.waitlistedAt))
      .limit(overCapacity ? 1 : Math.min(seats, WAITLIST_SWEEP_LIMIT));

    if (queue.length === 0) return [];

    const now = new Date();
    const seated: PromotedPerson[] = [];

    for (const row of queue) {
      // The seat is always the member row; this table is only ever the queue
      // for one. `onConflictDoNothing` covers the parent who was added to the
      // team by hand while their request sat in the line.
      await tx
        .insert(eventPlanMembers)
        .values({
          eventPlanId,
          userId: row.userId,
          role: "member",
          leadType: null,
        })
        .onConflictDoNothing();

      await tx
        .update(eventHelpRequests)
        .set({
          status: "approved",
          eventPlanId,
          waitlistedAt: null,
          promotedAt: now,
          decidedAt: now,
          ...(options?.promotedBy ? { decidedBy: options.promotedBy } : {}),
        })
        .where(eq(eventHelpRequests.id, row.id));

      seated.push({
        requestId: row.id,
        userId: row.userId,
        schoolId: row.schoolId,
        eventTitle: entry.title,
        eventSlug: entry.slug,
      });
    }

    return seated;
  });

  // Past the commit: a promotion that has already been decided must not be
  // able to roll back because APNs is having an afternoon. `notify()` never
  // throws, so this is belt and braces.
  for (const person of promoted) {
    await notify({
      // Reused verbatim rather than given a type of its own — it already says
      // the right thing and already bypasses quiet hours, and a second type for
      // the same event is how two notifications for one thing start.
      type: "signup_promoted",
      schoolId: person.schoolId,
      recipients: [person.userId],
      title: "You're off the waitlist",
      body: `A spot opened on the team planning ${person.eventTitle} and it's yours.`,
      url: `/events/${person.eventSlug}`,
    });
  }

  return { promoted: promoted.length };
}

/**
 * Approving one named request: seat them if there is a seat, put them in the
 * line if there isn't.
 *
 * **Approval is a human act, always** — this never auto-promotes anyone else,
 * which is what separates it from the sweep above. Approving into a full team
 * neither silently succeeds nor silently fails: it returns `{ promoted: 0 }`,
 * which is precisely the contract `WaitlistPanel` understands. The panel
 * follows with `promoteOverCapacityCopy` ("Field Day is full (8/8). Add Ann
 * anyway? … nobody is bumped") and calls again with `overCapacity: true`.
 *
 * Runs inside the same row lock the sweep uses, so an approval and an automatic
 * promotion can't claim the same seat.
 */
export async function seatOrWaitlistHelpRequest(params: {
  requestId: string;
  eventPlanId: string;
  decidedBy: string;
  overCapacity: boolean;
}): Promise<{ promoted: number; waitlisted: boolean }> {
  const { requestId, eventPlanId, decidedBy, overCapacity } = params;

  return dbPool.transaction(async (tx) => {
    const [plan] = await tx
      .select({ id: eventPlans.id, eventCatalogId: eventPlans.eventCatalogId })
      .from(eventPlans)
      .where(eq(eventPlans.id, eventPlanId))
      .for("update");
    if (!plan) throw new Error("Event plan not found");

    const [request] = await tx
      .select()
      .from(eventHelpRequests)
      .where(eq(eventHelpRequests.id, requestId));
    if (!request) throw new Error("That request no longer exists");

    const [entry] = await tx
      .select({ helpCap: eventCatalog.helpCap })
      .from(eventCatalog)
      .where(eq(eventCatalog.id, request.eventCatalogId));

    const now = new Date();

    // Already on the team — a lead added them by hand while the request sat in
    // the queue. Stamp the receipt and create nothing.
    const [existingSeat] = await tx
      .select({ id: eventPlanMembers.id })
      .from(eventPlanMembers)
      .where(
        and(
          eq(eventPlanMembers.eventPlanId, eventPlanId),
          eq(eventPlanMembers.userId, request.userId)
        )
      );

    const taken = await countEventPlanSeats(tx, eventPlanId);
    const cap = entry?.helpCap ?? null;
    const hasSeat = existingSeat || cap === null || taken < cap || overCapacity;

    if (!hasSeat) {
      // Keep the timestamp of an existing place in line: re-approving someone
      // already waiting must not send them to the back of their own queue.
      await tx
        .update(eventHelpRequests)
        .set({
          status: "waitlisted",
          waitlistedAt: request.waitlistedAt ?? now,
          decidedBy,
          decidedAt: now,
        })
        .where(eq(eventHelpRequests.id, requestId));
      return { promoted: 0, waitlisted: true };
    }

    if (!existingSeat) {
      await tx
        .insert(eventPlanMembers)
        .values({
          eventPlanId,
          userId: request.userId,
          role: "member",
          leadType: null,
        })
        .onConflictDoNothing();
    }

    await tx
      .update(eventHelpRequests)
      .set({
        status: "approved",
        eventPlanId,
        waitlistedAt: null,
        promotedAt: request.waitlistedAt ? now : null,
        decidedBy,
        decidedAt: now,
      })
      .where(eq(eventHelpRequests.id, requestId));

    return { promoted: 1, waitlisted: false };
  });
}

/**
 * Give back every planning-team seat one person is holding, and move the line.
 *
 * `event_plan_members.user_id` is **ON DELETE CASCADE**, so deleting an account
 * removes the row without any sweep — the seat frees and the line doesn't move.
 * This runs first, from `releaseSignupSeatsForUser()`, exactly as the volunteer
 * and committee halves do, so whoever is next is seated and told rather than
 * left waiting on a vacancy nobody observed.
 *
 * Scope it with `schoolId` / `schoolYear` when the reason is local (someone
 * leaving one school's roster); omit them when the account itself is going away.
 */
export async function releaseEventPlanSeatsForUser(params: {
  userId: string;
  removedBy: string;
  schoolId?: string;
  schoolYear?: string;
}): Promise<number> {
  const { userId, removedBy, schoolId, schoolYear } = params;

  const rows = await db
    .select({ id: eventPlanMembers.id, eventPlanId: eventPlanMembers.eventPlanId })
    .from(eventPlanMembers)
    .innerJoin(eventPlans, eq(eventPlans.id, eventPlanMembers.eventPlanId))
    .where(
      and(
        eq(eventPlanMembers.userId, userId),
        schoolId ? eq(eventPlans.schoolId, schoolId) : undefined,
        schoolYear ? eq(eventPlans.schoolYear, schoolYear) : undefined
      )
    );

  // Their asks go too — a place in line is a claim on a future seat, and
  // leaving one behind would promote someone who has gone. An *approved* row is
  // deleted for the same reason: it is only ever the receipt for a member row,
  // and the member row is going away here. This table is never a second source
  // of truth about who is on a team.
  await db
    .delete(eventHelpRequests)
    .where(
      and(
        eq(eventHelpRequests.userId, userId),
        schoolId ? eq(eventHelpRequests.schoolId, schoolId) : undefined,
        schoolYear ? eq(eventHelpRequests.schoolYear, schoolYear) : undefined
      )
    );

  // Sequentially, not in parallel: each sweep takes a row lock on the plan, and
  // someone on two plans of the same event would have those sweeps contend.
  for (const row of rows) {
    await db.delete(eventPlanMembers).where(eq(eventPlanMembers.id, row.id));
    await promoteFromEventHelpWaitlist(row.eventPlanId, {
      promotedBy: removedBy,
    });
  }

  return rows.length;
}

/**
 * The current year's plan for a recurring event, if the board has opened one.
 *
 * Shared by the member projection and by every request path, so "is there a
 * team to join yet?" has one answer. Draft and rejected plans are real plans
 * for this purpose — a request can be seated on one — but §8 keeps their
 * *status* out of what a parent sees.
 */
export async function currentPlanForCatalogEntry(
  eventCatalogId: string,
  schoolYear: string
) {
  return db.query.eventPlans.findFirst({
    where: and(
      eq(eventPlans.eventCatalogId, eventCatalogId),
      eq(eventPlans.schoolYear, schoolYear)
    ),
    columns: {
      id: true,
      title: true,
      status: true,
      eventDate: true,
      startTime: true,
      endTime: true,
      location: true,
      schoolYear: true,
    },
  });
}

/** Whether this user already holds a seat on the plan's team. */
export async function isOnEventPlanTeam(
  userId: string,
  eventPlanId: string
): Promise<boolean> {
  const row = await db.query.eventPlanMembers.findFirst({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.userId, userId)
    ),
    columns: { id: true },
  });
  return !!row;
}

/** Real accounts on a plan's team — placeholders have nobody to notify. */
export async function eventPlanLeadUserIds(
  eventPlanId: string
): Promise<string[]> {
  const rows = await db
    .select({ userId: eventPlanMembers.userId })
    .from(eventPlanMembers)
    .where(
      and(
        eq(eventPlanMembers.eventPlanId, eventPlanId),
        eq(eventPlanMembers.role, "lead"),
        isNotNull(eventPlanMembers.userId)
      )
    );
  return [...new Set(rows.map((r) => r.userId!))];
}
