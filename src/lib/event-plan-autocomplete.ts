import "server-only";

import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { todayDateOnly } from "@/lib/date-only";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { getEventPlanSettings } from "@/lib/event-plan-settings";
import { stampContactUsage } from "@/lib/contacts/usage";

/**
 * Close out the plans whose event has already happened.
 *
 * Nothing used to move a plan out of `approved` or `pending_approval`, so a
 * school's plan list filled up with events that had run months ago and still
 * described themselves as being planned — and the wrap-up, which is the whole
 * year-over-year story, was never offered because it only appears on a
 * completed plan.
 *
 * Two rules keep this from being destructive:
 *
 * - **It never completes a `draft` or a `rejected` plan.** Completing is not
 *   reversible without a board member (`reopenEventPlan`), and it makes the
 *   plan undeletable — see `canDeleteEventPlanStatus`. A draft is often a plan
 *   nobody ever ran; the plan page nudges a lead to close that out by hand
 *   instead.
 * - **It only looks at plans with a real date.** A plan with no `event_date`
 *   has said nothing about when it happens, and guessing from `school_year`
 *   would sweep a plan the week it was created.
 *
 * Safe to call on a read path: it is one indexed UPDATE that usually matches
 * nothing, and it is idempotent. It deliberately does **not** revalidate — a
 * server component render may not — so the caller that renders from this data
 * should call it before it queries.
 */
export async function completePastEventPlans(
  schoolId: string | null | undefined
): Promise<number> {
  if (!schoolId) return 0;

  const settings = await getEventPlanSettings(schoolId);
  if (!settings.autoCompletePastEvents) return 0;

  // "Today" in the school's zone, never the server's: on Vercel a Denver school
  // is already tomorrow from 6pm, which would close an event out on its own
  // evening. The boundary is the *start* of today in UTC rather than
  // parseDateOnly's noon anchor, so a row written before date-only.ts existed —
  // midnight UTC rather than noon — isn't swept on the morning of its event.
  const today = todayDateOnly(await getSchoolTimeZone(schoolId));
  const startOfToday = new Date(`${today}T00:00:00.000Z`);

  const completed = await db
    .update(eventPlans)
    .set({ status: "completed", updatedAt: new Date() })
    .where(
      and(
        eq(eventPlans.schoolId, schoolId),
        inArray(eventPlans.status, ["approved", "pending_approval"]),
        isNotNull(eventPlans.eventDate),
        lt(eventPlans.eventDate, startOfToday)
      )
    )
    .returning({ id: eventPlans.id, schoolYear: eventPlans.schoolYear });

  // Same bookkeeping `completeEventPlan` does by hand: every contact this event
  // used counts as current, so a vendor nobody has called in three years reads
  // as stale in the directory. Sequential because this normally runs zero or
  // one time — the sweep only has work the first day after an event.
  for (const plan of completed) {
    await stampContactUsage(plan.id, plan.schoolYear);
  }

  return completed.length;
}
