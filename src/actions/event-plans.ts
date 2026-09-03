"use server";

import {
  assertAuthenticated,
  assertEventPlanAccess,
  assertEventPlanWriteAccess,
  getCurrentSchoolId,
  assertPtaBoardMember,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventPlans,
  eventPlanMembers,
  eventPlanTasks,
  eventPlanInvites,
  eventPlanMessages,
  eventPlanApprovals,
  eventPlanResources,
  eventPlanWrapUps,
  eventContactLinks,
  eventCatalog,
  schoolMemberships,
} from "@/lib/db/schema";
import { and, eq, sql, gte, desc, asc, isNull } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import type { TaskTimingTag } from "@/types";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notify } from "@/lib/notify";
import { notifyMessagePosted } from "@/lib/notify-messages";
import { boardRecipients, eventPlanRecipients } from "@/lib/notify-recipients";
import { EVENT_PLAN_STATUSES, canDeleteEventPlanStatus } from "@/lib/constants";
import { getEventPlanSettings } from "@/lib/event-plan-settings";
import type { EventPlanMemberRole, EventPlanLeadType } from "@/types";
import { assertHttpUrl, parseStoredList, serializeList } from "@/lib/utils";
import {
  addDaysToDateOnly,
  parseDateOnly,
  toDateOnly,
} from "@/lib/date-only";
import { normalizeTags } from "@/lib/tags";
import { ensureTagsExist, syncTagUsage } from "@/lib/tag-usage";
import { stampContactUsage } from "@/lib/contacts/usage";
import { generateDiscussionAiResponse } from "./event-plan-ai";
import {
  claimBoardLead,
  initialLeadType,
  resolveLeadType,
} from "@/lib/event-plan-leads";
import { promoteFromEventHelpWaitlist } from "@/lib/event-help-onboarding";
import {
  appendPlanTasks,
  missingCatalogKeyTasks,
  seedPlanTasksFromCatalog,
} from "@/lib/event-plan-seed";
import { isBackwardsTimeRange, normalizeTimeOfDay } from "@/lib/time-of-day";

/**
 * Confirm a catalog entry belongs to this school before a plan points at it.
 */
async function assertCatalogEntryInSchool(
  catalogId: string,
  schoolId: string
) {
  const entry = await db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.id, catalogId),
      eq(eventCatalog.schoolId, schoolId)
    ),
    columns: { id: true },
  });
  if (!entry) throw new Error("That recurring event doesn't exist");
}

/**
 * The two wall-clock times a plan may carry, narrowed together.
 *
 * Narrowed in the action rather than trusted from the form, for the same reason
 * `normalizeEmoji` and `normalizeStudents` are: the field takes text, and the
 * input's own rules are a courtesy. An end before its start is rejected outright
 * — every other range field in the app validates that, and "ends at 9am, starts
 * at 11am" is not a thing anybody meant.
 */
function narrowEventTimes(input: {
  startTime?: string | null;
  endTime?: string | null;
}): { startTime: string | null; endTime: string | null } {
  const startTime = normalizeTimeOfDay(input.startTime);
  const endTime = normalizeTimeOfDay(input.endTime);

  if (isBackwardsTimeRange(startTime, endTime)) {
    throw new Error("The end time has to be after the start time");
  }
  // An end with no start isn't a range and reads as nonsense on its own.
  return { startTime, endTime: startTime ? endTime : null };
}

// ─── Event Plan CRUD ───────────────────────────────────────────────────────

export async function createEventPlan(data: {
  title: string;
  description?: string;
  eventType?: string;
  /** The recurring event this is a year's instance of. */
  eventCatalogId?: string;
  /** True when the organizer says this event won't repeat. */
  isOneOff?: boolean;
  eventDate?: string;
  /** Wall-clock times at the school, "HH:MM". See src/lib/time-of-day.ts. */
  startTime?: string;
  endTime?: string;
  location?: string;
  budget?: string;
  tags?: string[];
  signupGeniusUrl?: string;
  schoolYear: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Event plans belong to the board. Volunteers take part by being added to a
  // specific plan, not by opening their own.
  await assertPtaBoardMember(user.id!, schoolId);

  if (data.signupGeniusUrl) {
    assertHttpUrl(data.signupGeniusUrl);
  }

  // Every plan must declare itself either an instance of a recurring event or
  // a deliberate one-off. Left to a "nice to have" field, most plans never get
  // filed, and next year's lead inherits nothing.
  if (!data.eventCatalogId && !data.isOneOff) {
    throw new Error(
      "Pick which recurring event this is, or mark it as a one-off event."
    );
  }
  if (data.eventCatalogId) {
    await assertCatalogEntryInSchool(data.eventCatalogId, schoolId);
  }

  const tags = normalizeTags(data.tags);
  const times = narrowEventTimes(data);

  const [plan] = await db
    .insert(eventPlans)
    .values({
      schoolId,
      title: data.title,
      description: data.description || null,
      eventType: data.eventType || null,
      eventCatalogId: data.eventCatalogId || null,
      isOneOff: data.isOneOff ?? false,
      eventDate: parseDateOnly(data.eventDate),
      startTime: times.startTime,
      endTime: times.endTime,
      location: data.location || null,
      budget: data.budget || null,
      tags: tags.length > 0 ? tags : null,
      signupGeniusUrl: data.signupGeniusUrl?.trim() || null,
      schoolYear: data.schoolYear,
      createdBy: user.id!,
    })
    .returning();

  // Auto-add creator as lead, classified so the year-planning screen can see
  // who owns this plan rather than reporting it as unassigned.
  await db.insert(eventPlanMembers).values({
    eventPlanId: plan.id,
    userId: user.id!,
    role: "lead",
    leadType: await initialLeadType(user.id!, schoolId, data.schoolYear),
  });

  // The same inheritance a generated plan gets. A plan created by hand and one
  // opened from Plan the Year are the same thing to whoever runs the event, so
  // they must arrive holding the same starting list.
  if (data.eventCatalogId) {
    const entry = await db.query.eventCatalog.findFirst({
      where: eq(eventCatalog.id, data.eventCatalogId),
      columns: { keyTasks: true },
    });
    await seedPlanTasksFromCatalog({
      eventPlanId: plan.id,
      keyTasks: entry?.keyTasks,
      createdBy: user.id!,
    });
  }

  if (tags.length > 0) await ensureTagsExist(tags);

  revalidatePath("/events/plans");
  revalidatePath("/events");
  revalidatePath("/admin/board/event-catalog");
  return plan;
}

export async function updateEventPlan(
  id: string,
  data: {
    title?: string;
    description?: string;
    eventType?: string;
    eventCatalogId?: string | null;
    isOneOff?: boolean;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    budget?: string;
    tags?: string[];
    signupGeniusUrl?: string;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, id, ["lead"]);

  if (data.signupGeniusUrl) {
    assertHttpUrl(data.signupGeniusUrl);
  }

  const existing = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
    columns: { schoolId: true, tags: true, startTime: true, endTime: true },
  });
  if (!existing) throw new Error("Event plan not found");

  if (data.eventCatalogId && existing.schoolId) {
    await assertCatalogEntryInSchool(data.eventCatalogId, existing.schoolId);
  }

  const tags = data.tags !== undefined ? normalizeTags(data.tags) : undefined;

  // Narrowed as a pair even when only one side was sent — "ends before it
  // starts" is a fact about the two together, so the half that wasn't in the
  // patch is taken from the row.
  const times =
    data.startTime !== undefined || data.endTime !== undefined
      ? narrowEventTimes({
          startTime:
            data.startTime !== undefined ? data.startTime : existing.startTime,
          endTime: data.endTime !== undefined ? data.endTime : existing.endTime,
        })
      : null;

  await db
    .update(eventPlans)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.eventCatalogId !== undefined && {
        eventCatalogId: data.eventCatalogId,
        // Filing under a recurring event and calling it a one-off are mutually
        // exclusive answers to the same question.
        ...(data.eventCatalogId ? { isOneOff: false } : {}),
      }),
      ...(data.isOneOff !== undefined && {
        isOneOff: data.isOneOff,
        ...(data.isOneOff ? { eventCatalogId: null } : {}),
      }),
      ...(tags !== undefined && { tags: tags.length > 0 ? tags : null }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.eventType !== undefined && {
        eventType: data.eventType || null,
      }),
      ...(data.eventDate !== undefined && {
        eventDate: parseDateOnly(data.eventDate),
      }),
      ...(times !== null && {
        startTime: times.startTime,
        endTime: times.endTime,
      }),
      ...(data.location !== undefined && {
        location: data.location || null,
      }),
      ...(data.budget !== undefined && { budget: data.budget || null }),
      ...(data.signupGeniusUrl !== undefined && {
        signupGeniusUrl: data.signupGeniusUrl.trim() || null,
      }),
      updatedAt: new Date(),
    })
    .where(eq(eventPlans.id, id));

  if (tags !== undefined) await syncTagUsage(existing.tags ?? [], tags);

  revalidatePath(`/events/plans/${id}`);
  revalidatePath("/events/plans");
  revalidatePath("/events");
  revalidatePath("/admin/board/event-catalog");
}

export async function deleteEventPlan(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Deleting is board/admin only. Being the plan's creator or lead is not
  // enough: leads are ordinary volunteers, and a plan carries board votes,
  // tasks, and attached documents that outlive whoever created it.
  await assertPtaBoardMember(user.id!, schoolId);

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, id), eq(eventPlans.schoolId, schoolId)),
  });
  if (!plan) throw new Error("Event plan not found");

  if (!canDeleteEventPlanStatus(plan.status)) {
    throw new Error(
      `An event plan marked ${EVENT_PLAN_STATUSES[plan.status]} can't be deleted. Its approval history and documents are part of the school's record.`
    );
  }

  await db.delete(eventPlans).where(eq(eventPlans.id, id));

  revalidatePath("/events/plans");
  revalidatePath("/events");
}

// ─── Status Transitions ────────────────────────────────────────────────────

export async function submitForApproval(id: string) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, id, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
  });
  if (!plan) throw new Error("Event plan not found");
  if (plan.status !== "draft" && plan.status !== "rejected") {
    throw new Error(
      "Only plans still in planning, or ones the board rejected, can be submitted for approval"
    );
  }

  // Clear any previous votes if resubmitting
  await db
    .delete(eventPlanApprovals)
    .where(eq(eventPlanApprovals.eventPlanId, id));

  await db
    .update(eventPlans)
    .set({ status: "pending_approval", updatedAt: new Date() })
    .where(eq(eventPlans.id, id));

  const planSchoolId = plan.schoolId;
  if (planSchoolId) {
    after(async () =>
      notify({
        type: "approval_requested",
        schoolId: planSchoolId,
        recipients: await boardRecipients(planSchoolId),
        actorId: user.id!,
        title: "An event plan needs your vote",
        body: `${plan.title} was submitted for approval.`,
        url: `/events/plans/${id}`,
        // Collapsed per plan: a resubmitted plan replaces its own earlier
        // request rather than adding a second one to every board member's
        // inbox.
        groupKey: `approval:${id}`,
      })
    );
  }

  revalidatePath(`/events/plans/${id}`);
  revalidatePath("/events/plans");
  revalidatePath("/events");
}

export async function voteOnEventPlan(
  id: string,
  vote: "approve" | "reject",
  comment?: string
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, id), eq(eventPlans.schoolId, schoolId)),
  });
  if (!plan) throw new Error("Event plan not found");
  if (plan.status !== "pending_approval") {
    throw new Error("Can only vote on plans pending approval");
  }

  // Upsert the vote (unique constraint on eventPlanId + userId)
  const existing = await db.query.eventPlanApprovals.findFirst({
    where: and(
      eq(eventPlanApprovals.eventPlanId, id),
      eq(eventPlanApprovals.userId, user.id!)
    ),
  });

  if (existing) {
    await db
      .update(eventPlanApprovals)
      .set({ vote, comment: comment || null, createdAt: new Date() })
      .where(eq(eventPlanApprovals.id, existing.id));
  } else {
    await db.insert(eventPlanApprovals).values({
      eventPlanId: id,
      userId: user.id!,
      vote,
      comment: comment || null,
    });
  }

  // Check if any rejection → reject the plan
  //
  // `decided` is set only on the vote that actually settles the plan — the
  // rejection, or the one that reaches the threshold. An intermediate approve
  // is not news to the leads, and notifying on every vote would tell them the
  // outcome twice.
  let decided: "approved" | "rejected" | null = null;

  if (vote === "reject") {
    await db
      .update(eventPlans)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(eventPlans.id, id));
    decided = "rejected";
  } else {
    // Count approvals, auto-approve if threshold met. How many votes that takes
    // is the school's own rule and defaults to one — see
    // src/lib/event-plan-settings.ts for why.
    const [approvals, settings] = await Promise.all([
      db.query.eventPlanApprovals.findMany({
        where: and(
          eq(eventPlanApprovals.eventPlanId, id),
          eq(eventPlanApprovals.vote, "approve")
        ),
      }),
      getEventPlanSettings(schoolId),
    ]);

    if (approvals.length >= settings.approvalThreshold) {
      await db
        .update(eventPlans)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(eventPlans.id, id));
      decided = "approved";
    }
  }

  if (decided) {
    const outcome = decided;
    after(async () => {
      const leads = await db
        .select({ userId: eventPlanMembers.userId })
        .from(eventPlanMembers)
        .where(
          and(
            eq(eventPlanMembers.eventPlanId, id),
            eq(eventPlanMembers.role, "lead")
          )
        );

      await notify({
        type: "approval_decided",
        schoolId,
        recipients: leads.map((l) => l.userId),
        actorId: user.id!,
        title:
          outcome === "approved"
            ? "Your event plan was approved"
            : "Your event plan was sent back",
        body:
          outcome === "approved"
            ? `${plan.title} has the votes it needed.`
            : `${plan.title} needs changes before it can be approved.`,
        url: `/events/plans/${id}`,
      });
    });
  }

  revalidatePath(`/events/plans/${id}`);
  revalidatePath("/events/plans");
  revalidatePath("/events");
}

/**
 * Close an event out.
 *
 * Reachable from **any** open status, not just `approved`. Closing out is not
 * an approval — it is one person recording that the event happened — and
 * routing it through the vote meant a plan nobody got round to submitting sat
 * in Draft describing a party that ran in October. One lead or board member,
 * one click. The vote still decides whether the plan was *approved*; it no
 * longer decides whether the school may write down that it took place.
 */
export async function completeEventPlan(id: string) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, id, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
    columns: { schoolYear: true, status: true },
  });
  if (!plan) throw new Error("Event plan not found");
  if (plan.status === "completed") return;

  await db
    .update(eventPlans)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(eventPlans.id, id));

  // Mark every contact this event used as current, so a vendor nobody has
  // called in three years is visible as such in the directory.
  await stampContactUsage(id, plan.schoolYear);

  revalidatePath(`/events/plans/${id}`);
  revalidatePath("/events/plans");
  revalidatePath("/events");
  revalidatePath("/admin/contacts");
}

/**
 * Put a completed plan back into a working state.
 *
 * Completing a plan locks it to its leads, which is the point — but it would
 * strand a plan whose lead has graduated out of the school. The board can
 * unlock it, and the plan goes back to `approved` rather than `draft` so the
 * votes it already won still stand.
 */
export async function reopenEventPlan(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Deliberately not assertEventPlanWriteAccess: this is the one action a
  // completed plan must still accept from someone who isn't its lead.
  await assertPtaBoardMember(user.id!, schoolId);

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, id), eq(eventPlans.schoolId, schoolId)),
    columns: { status: true },
  });
  if (!plan) throw new Error("Event plan not found");
  if (plan.status !== "completed") {
    throw new Error("Only a completed event plan can be reopened.");
  }

  await db
    .update(eventPlans)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(eventPlans.id, id));

  revalidatePath(`/events/plans/${id}`);
  revalidatePath("/events/plans");
  revalidatePath("/events");
}

// ─── Year-Over-Year ────────────────────────────────────────────────────────

/**
 * The most recent plan for the same recurring event from a year BEFORE this
 * one — the thing worth copying from.
 *
 * Strictly earlier, not merely different: viewing an old plan while a newer
 * year exists would otherwise surface the newer plan as the thing to copy
 * forward, which reads as history running backwards.
 */
export async function getPriorYearPlan(catalogId: string, schoolYear: string) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const plans = await db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.eventCatalogId, catalogId)
    ),
    columns: {
      id: true,
      title: true,
      schoolYear: true,
      description: true,
      location: true,
      budget: true,
    },
    orderBy: [desc(eventPlans.schoolYear)],
  });

  // School years sort correctly as strings ("2024-2025" < "2025-2026").
  return plans.find((p) => p.schoolYear < schoolYear) ?? null;
}

/**
 * True when a recurring event already has a plan filed under `schoolYear`.
 *
 * Guards the copy-forward flow: without it, "start this year from last year's"
 * happily creates a second plan for a year that already has one, and the two
 * diverge with nothing pointing at the duplicate.
 */
export async function hasPlanForSchoolYear(
  catalogId: string,
  schoolYear: string
): Promise<boolean> {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return false;

  const existing = await db.query.eventPlans.findFirst({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.eventCatalogId, catalogId),
      eq(eventPlans.schoolYear, schoolYear)
    ),
    columns: { id: true },
  });

  return Boolean(existing);
}

/**
 * What a prior year's plan has available to copy, with counts, so the copy
 * dialog can show "12 tasks, 4 resources, 3 contacts" instead of asking people
 * to agree to something invisible.
 */
export async function getClonePreview(sourcePlanId: string) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, sourcePlanId);

  const [plan, tasks, resources, contactLinks, members] = await Promise.all([
    db.query.eventPlans.findFirst({
      where: eq(eventPlans.id, sourcePlanId),
      columns: {
        id: true,
        title: true,
        schoolYear: true,
        description: true,
        location: true,
        budget: true,
        eventCatalogId: true,
      },
    }),
    db.query.eventPlanTasks.findMany({
      where: eq(eventPlanTasks.eventPlanId, sourcePlanId),
      columns: { id: true },
    }),
    // Only bare links are offered. Uploaded documents belong to the year they
    // were made — last year's signup sheet is not this year's signup sheet.
    db.query.eventPlanResources.findMany({
      where: and(
        eq(eventPlanResources.eventPlanId, sourcePlanId),
        isNull(eventPlanResources.documentId)
      ),
      columns: { id: true },
    }),
    db.query.eventContactLinks.findMany({
      where: eq(eventContactLinks.eventPlanId, sourcePlanId),
      columns: { id: true },
    }),
    db.query.eventPlanMembers.findMany({
      where: eq(eventPlanMembers.eventPlanId, sourcePlanId),
      columns: { id: true },
    }),
  ]);

  if (!plan) throw new Error("Event plan not found");

  return {
    plan,
    counts: {
      tasks: tasks.length,
      resources: resources.length,
      contacts: contactLinks.length,
      members: members.length,
    },
  };
}

/**
 * Start this school year's instance of a recurring event by copying last
 * year's plan.
 *
 * Everything is opt-in per category rather than "copy it all", because the
 * categories fail differently: tasks and contacts are exactly what should carry
 * forward, while last year's uploaded documents and assignees are actively
 * misleading if they silently reappear.
 */
export async function cloneEventPlan(
  sourcePlanId: string,
  options: {
    title: string;
    schoolYear: string;
    eventDate?: string;
    includeTasks: boolean;
    includeResources: boolean;
    includeContacts: boolean;
    includeMembers: boolean;
    includeDetails: boolean;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertEventPlanAccess(user.id!, sourcePlanId);
  // Cloning produces a new plan, so it answers to the same rule as
  // createEventPlan: the board decides which events the school runs.
  await assertPtaBoardMember(user.id!, schoolId);

  const source = await db.query.eventPlans.findFirst({
    where: and(
      eq(eventPlans.id, sourcePlanId),
      eq(eventPlans.schoolId, schoolId)
    ),
  });
  if (!source) throw new Error("Event plan not found");

  if (source.schoolYear === options.schoolYear) {
    throw new Error(
      "That plan is already filed under this school year. Pick a different year to copy into."
    );
  }

  // The recurring event can only have one plan per year. Two would split this
  // year's tasks, contacts, and wrap-up across a pair of pages that neither
  // links to the other.
  if (source.eventCatalogId) {
    const alreadyPlanned = await db.query.eventPlans.findFirst({
      where: and(
        eq(eventPlans.schoolId, schoolId),
        eq(eventPlans.eventCatalogId, source.eventCatalogId),
        eq(eventPlans.schoolYear, options.schoolYear)
      ),
      columns: { id: true },
    });
    if (alreadyPlanned) {
      throw new Error(
        `${options.schoolYear} already has a plan for this recurring event. Open that one instead of starting a second.`
      );
    }
  }

  const tags = normalizeTags(source.tags);

  const [plan] = await db
    .insert(eventPlans)
    .values({
      schoolId,
      title: options.title,
      description: options.includeDetails ? source.description : null,
      eventType: source.eventType,
      eventCatalogId: source.eventCatalogId,
      isOneOff: source.eventCatalogId ? false : source.isOneOff,
      eventDate: parseDateOnly(options.eventDate),
      location: options.includeDetails ? source.location : null,
      budget: options.includeDetails ? source.budget : null,
      tags: tags.length > 0 ? tags : null,
      schoolYear: options.schoolYear,
      createdBy: user.id!,
      // Deliberately not copied: status (starts as draft), approvals, messages,
      // AI recommendations, meetings, and the SignUpGenius link — all of which
      // are records of last year, not plans for this one.
    })
    .returning();

  // Carried members are read before the cloner is added so the two decisions
  // about lead type can be made together: exactly one person ends up as the
  // plan's board lead.
  const carried = options.includeMembers
    ? (
        await db.query.eventPlanMembers.findMany({
          where: eq(eventPlanMembers.eventPlanId, sourcePlanId),
        })
      ).filter((m) => m.userId !== user.id!)
    : [];

  // The cloner is opening this year's plan, so they lead it — unless last
  // year's board lead came across, in which case continuity wins and the cloner
  // is recorded as a chair. Either way the type is set, because the
  // year-planning screen reads ownership off it.
  const carriedBoardLead = carried.some((m) => m.leadType === "board");
  await db.insert(eventPlanMembers).values({
    eventPlanId: plan.id,
    userId: user.id!,
    role: "lead",
    leadType: carriedBoardLead
      ? "committee_chair"
      : await initialLeadType(user.id!, schoolId, options.schoolYear),
  });

  if (options.includeTasks) {
    const tasks = await db.query.eventPlanTasks.findMany({
      where: eq(eventPlanTasks.eventPlanId, sourcePlanId),
      orderBy: [asc(eventPlanTasks.sortOrder)],
    });

    if (tasks.length > 0) {
      // Shift due dates by the gap between the two events so "3 weeks before"
      // stays 3 weeks before. With no date on either end, dates are dropped
      // rather than carried over stale.
      //
      // The gap is counted in whole days between two calendar days, not in
      // milliseconds between two instants: the form gives a "YYYY-MM-DD" and
      // the source row gives a stored timestamp, so subtracting them directly
      // mixed two anchors and drifted the copied dates by half a day.
      const sourceDay = toDateOnly(source.eventDate);
      const targetDay = toDateOnly(options.eventDate);
      const shiftDays =
        sourceDay && targetDay
          ? Math.round(
              (Date.parse(`${targetDay}T00:00:00Z`) -
                Date.parse(`${sourceDay}T00:00:00Z`)) /
                86_400_000
            )
          : null;

      await db.insert(eventPlanTasks).values(
        tasks.map((task, index) => ({
          eventPlanId: plan.id,
          title: task.title,
          description: task.description,
          dueDate:
            shiftDays !== null && task.dueDate
              ? parseDateOnly(addDaysToDateOnly(task.dueDate, shiftDays))
              : null,
          // Completion and assignment are last year's facts about last year's
          // people. Carrying them would make a fresh plan look already done.
          completed: false,
          assignedTo: null,
          timingTag: task.timingTag,
          sortOrder: index,
          createdBy: user.id!,
        }))
      );
    }
  }

  if (options.includeResources) {
    const resources = await db.query.eventPlanResources.findMany({
      where: and(
        eq(eventPlanResources.eventPlanId, sourcePlanId),
        isNull(eventPlanResources.documentId)
      ),
    });

    if (resources.length > 0) {
      await db.insert(eventPlanResources).values(
        resources.map((resource) => ({
          eventPlanId: plan.id,
          knowledgeArticleId: resource.knowledgeArticleId,
          title: resource.title,
          url: resource.url,
          notes: resource.notes,
          addedBy: user.id!,
        }))
      );
    }
  }

  if (options.includeContacts) {
    const links = await db.query.eventContactLinks.findMany({
      where: eq(eventContactLinks.eventPlanId, sourcePlanId),
    });

    if (links.length > 0) {
      await db.insert(eventContactLinks).values(
        links.map((link) => ({
          contactId: link.contactId,
          eventPlanId: plan.id,
          usedFor: link.usedFor,
          sortOrder: link.sortOrder,
          createdBy: user.id!,
        }))
      );
    }
  }

  if (carried.length > 0) {
    await db.insert(eventPlanMembers).values(
      carried.map((member) => ({
        eventPlanId: plan.id,
        userId: member.userId,
        role: member.role,
        // A chair stays a chair in the new year, and a placeholder chair has no
        // user id — dropping their name would leave a row that is neither a
        // person nor a placeholder, which the identity CHECK rejects outright.
        leadType: member.leadType,
        placeholderName: member.placeholderName,
        placeholderEmail: member.placeholderEmail,
      }))
    );
  }

  if (tags.length > 0) await ensureTagsExist(tags);

  revalidatePath("/events/plans");
  revalidatePath("/events");
  revalidatePath("/admin/board/event-catalog");
  return plan;
}

// ─── Wrap-Up ───────────────────────────────────────────────────────────────

export async function getEventPlanWrapUp(eventPlanId: string) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);

  return (
    (await db.query.eventPlanWrapUps.findFirst({
      where: eq(eventPlanWrapUps.eventPlanId, eventPlanId),
    })) ?? null
  );
}

/**
 * The tip strings a year's notes contribute to the recurring event.
 *
 * Every one is stamped with the school year, which is both the useful context
 * for next year's lead ("From 2026-2027: book the bounce house by March") and
 * the handle this plan holds them by — see `appliedTips` in the schema.
 *
 * Order matters and is deliberate: the discrete tips first, because they are
 * what someone wrote *as* advice, then the two retrospective paragraphs.
 */
function catalogTipsFromWrapUp(
  schoolYear: string,
  values: { tips: string | null; whatWorked: string | null; whatToChange: string | null }
): string[] {
  return [...parseStoredList(values.tips), values.whatWorked, values.whatToChange]
    .filter((text): text is string => Boolean(text?.trim()))
    .map((text) => `From ${schoolYear}: ${text.trim()}`);
}

/**
 * Record what was learned running this event, and fold it into the recurring
 * event so next year's lead starts from it.
 *
 * This is what keeps the catalog honest. Without it, a recurring event's tips
 * and estimates are whatever somebody typed once, years ago, and the whole
 * year-over-year story quietly stops being true.
 *
 * **Applying is repeatable.** It used to be a one-shot latch — a boolean that,
 * once set, meant every later correction stayed on the plan and never reached
 * the catalog, which is the wrong way round: the note gets better as the year
 * goes on. Each save now removes exactly the tips this plan last contributed
 * and appends what it says today, so fixing a typo replaces the tip instead of
 * stacking a second copy. Matching is verbatim, so a tip the board has since
 * reworded on the catalog by hand no longer matches and is left alone.
 */
export async function saveEventPlanWrapUp(
  eventPlanId: string,
  data: {
    whatWorked?: string;
    whatToChange?: string;
    /** Discrete lessons, one per line — the shape the catalog stores. */
    tips?: string;
    actualCost?: string;
    actualVolunteers?: string;
    /** Merge the notes into the recurring event's tips and estimates. */
    applyToCatalog?: boolean;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
    columns: { id: true, eventCatalogId: true, schoolYear: true },
  });
  if (!plan) throw new Error("Event plan not found");

  const existing = await db.query.eventPlanWrapUps.findFirst({
    where: eq(eventPlanWrapUps.eventPlanId, eventPlanId),
  });

  const values = {
    whatWorked: data.whatWorked?.trim() || null,
    whatToChange: data.whatToChange?.trim() || null,
    tips: serializeList(data.tips ?? ""),
    actualCost: data.actualCost?.trim() || null,
    actualVolunteers: data.actualVolunteers?.trim() || null,
    submittedBy: user.id!,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(eventPlanWrapUps)
      .set(values)
      .where(eq(eventPlanWrapUps.id, existing.id));
  } else {
    await db.insert(eventPlanWrapUps).values({ eventPlanId, ...values });
  }

  const shouldApply = Boolean(data.applyToCatalog && plan.eventCatalogId);
  let appliedNow = false;

  if (shouldApply) {
    const entry = await db.query.eventCatalog.findFirst({
      where: eq(eventCatalog.id, plan.eventCatalogId!),
    });

    if (entry) {
      // Tips are stored as a list, so the year's lessons go in as their own
      // entries rather than concatenated text — otherwise the catalog page that
      // parses this column drops every tip on the entry.
      const learned = catalogTipsFromWrapUp(plan.schoolYear, values);
      const previously = new Set(parseStoredList(existing?.appliedTips));
      const kept = parseStoredList(entry.tips).filter(
        (tip) => !previously.has(tip)
      );

      await db
        .update(eventCatalog)
        .set({
          tips: serializeList([...kept, ...learned]),
          // Actuals beat estimates — last year's real numbers are the best
          // guess anyone has for next year's.
          estimatedBudget: values.actualCost ?? entry.estimatedBudget,
          estimatedVolunteers:
            values.actualVolunteers ?? entry.estimatedVolunteers,
          updatedAt: new Date(),
        })
        .where(eq(eventCatalog.id, entry.id));

      await db
        .update(eventPlanWrapUps)
        .set({
          appliedToCatalog: true,
          appliedTips: serializeList(learned),
        })
        .where(eq(eventPlanWrapUps.eventPlanId, eventPlanId));
      appliedNow = true;
    }
  }

  revalidatePath(`/events/plans/${eventPlanId}`);
  revalidatePath("/admin/board/event-catalog");
  revalidatePath("/events");
  return { success: true, appliedToCatalog: appliedNow };
}

// ─── Member Management ─────────────────────────────────────────────────────

export async function addEventPlanMember(
  eventPlanId: string,
  userId: string,
  role: EventPlanMemberRole,
  leadType?: EventPlanLeadType | null
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId, ["lead"]);

  // The id comes from the client, so confirm it belongs to someone at this
  // plan's school before handing them the keys. Anyone else has to come in
  // through inviteEventPlanMemberByEmail, which grants school access first.
  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
    columns: { schoolId: true },
  });
  if (!plan?.schoolId) throw new Error("Event plan not found");

  const schoolYear = await getSchoolCurrentYear(plan.schoolId);
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, plan.schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved")
    ),
  });
  if (!membership) {
    throw new Error(
      "That person isn't a member of this school yet — invite them by email instead."
    );
  }

  // Adding someone twice is a double-click, not an error worth showing — and
  // stopping here matters more than tidiness, since claiming the board lead
  // below demotes the incumbent and shouldn't do so for an add that no-ops.
  // Changing an existing member's title goes through updateEventPlanMemberRole.
  const already = await db.query.eventPlanMembers.findFirst({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.userId, userId)
    ),
    columns: { id: true },
  });
  if (already) {
    revalidatePath(`/events/plans/${eventPlanId}`);
    return;
  }

  await db
    .insert(eventPlanMembers)
    .values({
      eventPlanId,
      userId,
      role,
      leadType:
        role === "lead"
          ? await nextLeadTypeFor({
              eventPlanId,
              userId,
              schoolId: plan.schoolId,
              schoolYear,
              chosen: leadType,
            })
          : null,
    })
    .onConflictDoNothing();

  revalidatePath(`/events/plans/${eventPlanId}`);
  // Our Events names a plan's leads, so who is on one is now front-window news.
  revalidatePath("/events");
}

/**
 * The lead type to store for someone being made a lead.
 *
 * An explicit "Board Lead" is honoured (or refused out loud); anything else is
 * left to `resolveLeadType`, which can only ever land on committee chair or
 * work the answer out for a caller who didn't say.
 */
async function nextLeadTypeFor(opts: {
  eventPlanId: string;
  userId: string | null;
  schoolId: string;
  schoolYear: string;
  chosen?: EventPlanLeadType | null;
  exceptMemberId?: string;
}) {
  const { chosen, exceptMemberId, ...rest } = opts;

  if (chosen === "board") {
    return claimBoardLead({ ...rest, exceptMemberId });
  }
  return resolveLeadType({ ...rest, preferred: chosen });
}

/**
 * Look a membership row up and confirm the caller may change it.
 *
 * Rows are addressed by their own id rather than by user id because a committee
 * chair assigned before they had an account has no user id to address.
 */
async function assertMemberRowWritable(memberId: string) {
  const user = await assertAuthenticated();

  const row = await db.query.eventPlanMembers.findFirst({
    where: eq(eventPlanMembers.id, memberId),
  });
  if (!row) throw new Error("That person isn't on this plan");

  await assertEventPlanWriteAccess(user.id!, row.eventPlanId, ["lead"]);
  return row;
}

/**
 * How many leads a plan would have left if `memberId` stopped being one.
 *
 * A plan with no lead is one nobody can edit once it completes, so both removal
 * and demotion check this.
 */
async function leadsBesides(eventPlanId: string, memberId: string) {
  const leads = await db.query.eventPlanMembers.findMany({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.role, "lead")
    ),
    columns: { id: true },
  });
  return leads.filter((l) => l.id !== memberId).length;
}

export async function removeEventPlanMember(memberId: string) {
  const row = await assertMemberRowWritable(memberId);

  if (row.role === "lead" && (await leadsBesides(row.eventPlanId, memberId)) === 0) {
    throw new Error("Cannot remove the last lead");
  }

  await db.delete(eventPlanMembers).where(eq(eventPlanMembers.id, memberId));

  // A seat must never free itself silently. Removing someone opens a place on
  // the team, and whoever is next in line is promoted and told — the same rule
  // `deactivateCommitteeSignup` follows, and the reason a waitlist is a promise
  // rather than a list.
  await promoteFromEventHelpWaitlist(row.eventPlanId, {
    promotedBy: (await assertAuthenticated()).id!,
  });

  revalidatePath(`/events/plans/${row.eventPlanId}`);
  revalidatePath("/admin/board/event-requests");
  // A lead who stepped down must stop being the name a parent writes to.
  revalidatePath("/events");
}

export async function updateEventPlanMemberRole(
  memberId: string,
  role: EventPlanMemberRole,
  leadType?: EventPlanLeadType | null
) {
  const row = await assertMemberRowWritable(memberId);

  if (
    role === "member" &&
    row.role === "lead" &&
    (await leadsBesides(row.eventPlanId, memberId)) === 0
  ) {
    throw new Error("Cannot demote the last lead");
  }

  // The members list can now say which kind of lead, so an explicit choice is
  // taken at its word — including a switch between the two titles, which is the
  // whole point of being able to say. Where it says only "lead" (an older
  // caller, or a promotion that didn't ask), the type is still worked out
  // rather than left null: a lead with no type is invisible to the
  // year-planning screen, which would then report this plan as unowned.
  let nextLeadType: EventPlanLeadType | null =
    role === "lead" ? (leadType ?? row.leadType) : null;

  if (role === "lead" && (leadType === "board" || !nextLeadType)) {
    const plan = await db.query.eventPlans.findFirst({
      where: eq(eventPlans.id, row.eventPlanId),
      columns: { schoolId: true, schoolYear: true },
    });
    if (plan?.schoolId) {
      nextLeadType = await nextLeadTypeFor({
        eventPlanId: row.eventPlanId,
        userId: row.userId,
        schoolId: plan.schoolId,
        schoolYear: plan.schoolYear,
        chosen: leadType,
        exceptMemberId: memberId,
      });
    } else if (leadType === "board") {
      // Board membership is what makes a board lead, and there's no school to
      // check it against. Better to say so than to record an unchecked one.
      throw new Error("Event plan not found");
    }
  }

  await db
    .update(eventPlanMembers)
    .set({
      role,
      // A plain member has no lead type to hold, so demoting clears it rather
      // than leaving "committee chair" on someone who is no longer a lead.
      leadType: nextLeadType,
    })
    .where(eq(eventPlanMembers.id, memberId));

  revalidatePath(`/events/plans/${row.eventPlanId}`);
  // A title change is what Our Events prints beside the name.
  revalidatePath("/events");
}

// Self-service joining is deliberately absent. Event plans carry budgets,
// vendor contacts and candid meeting notes, so membership is granted by a lead
// or the board through addEventPlanMember — never claimed.

// ─── Tasks ─────────────────────────────────────────────────────────────────

/**
 * A task's "Assign to" picker offers both real members and people who've been
 * invited but haven't logged in yet. Invite options carry an `invite:` prefix
 * so the two id spaces (both uuids) can't be confused; everything else is a
 * plain user id. Returns the pair of mutually-exclusive columns to write, after
 * confirming an invite actually belongs to this plan.
 */
async function resolveTaskAssignee(
  eventPlanId: string,
  value: string | undefined
): Promise<{ assignedTo: string | null; assignedInviteId: string | null }> {
  if (!value) return { assignedTo: null, assignedInviteId: null };

  if (value.startsWith("invite:")) {
    const inviteId = value.slice("invite:".length);
    const invite = await db.query.eventPlanInvites.findFirst({
      where: and(
        eq(eventPlanInvites.id, inviteId),
        eq(eventPlanInvites.eventPlanId, eventPlanId)
      ),
      columns: { id: true },
    });
    if (!invite) throw new Error("That invitee is not part of this plan.");
    return { assignedTo: null, assignedInviteId: invite.id };
  }

  return { assignedTo: value, assignedInviteId: null };
}

export async function createEventPlanTask(
  eventPlanId: string,
  data: {
    title: string;
    description?: string;
    dueDate?: string;
    assignedTo?: string;
    timingTag?: TaskTimingTag;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId);

  // Get max sortOrder to add new task at the end
  const maxOrderResult = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${eventPlanTasks.sortOrder}), -1)` })
    .from(eventPlanTasks)
    .where(eq(eventPlanTasks.eventPlanId, eventPlanId));
  const nextOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

  const assignee = await resolveTaskAssignee(eventPlanId, data.assignedTo);

  await db.insert(eventPlanTasks).values({
    eventPlanId,
    title: data.title,
    description: data.description || null,
    dueDate: parseDateOnly(data.dueDate),
    assignedTo: assignee.assignedTo,
    assignedInviteId: assignee.assignedInviteId,
    timingTag: data.timingTag || null,
    sortOrder: nextOrder,
    createdBy: user.id!,
  });

  // Only `assignedTo`. A task assigned to an *invite* has no account to notify
  // — the invitation email is that person's notification, and
  // `acceptEventPlanInvite` moves the task onto their real id when they join.
  if (assignee.assignedTo) {
    const assigneeId = assignee.assignedTo;
    after(() =>
      notifyEventPlanTaskAssigned({
        eventPlanId,
        assigneeId,
        actorId: user.id!,
        title: data.title,
      })
    );
  }

  revalidatePath(`/events/plans/${eventPlanId}`);
}

/** "X assigned you a task", for both the create and the edit path. */
async function notifyEventPlanTaskAssigned(params: {
  eventPlanId: string;
  assigneeId: string;
  actorId: string;
  title: string;
}) {
  if (params.assigneeId === params.actorId) return;
  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, params.eventPlanId),
    columns: { title: true, schoolId: true },
  });
  if (!plan?.schoolId) return;

  await notify({
    type: "task_assigned",
    schoolId: plan.schoolId,
    recipients: [params.assigneeId],
    actorId: params.actorId,
    title: "New task for you",
    body: `${params.title} — ${plan.title}`,
    url: `/events/plans/${params.eventPlanId}`,
  });
}

export async function updateEventPlanTask(
  taskId: string,
  data: {
    title?: string;
    description?: string;
    dueDate?: string;
    assignedTo?: string;
    timingTag?: TaskTimingTag | null;
  }
) {
  const user = await assertAuthenticated();

  const task = await db.query.eventPlanTasks.findFirst({
    where: eq(eventPlanTasks.id, taskId),
  });
  if (!task) throw new Error("Task not found");

  await assertEventPlanWriteAccess(user.id!, task.eventPlanId);

  const assignee =
    data.assignedTo !== undefined
      ? await resolveTaskAssignee(task.eventPlanId, data.assignedTo)
      : null;

  await db
    .update(eventPlanTasks)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.dueDate !== undefined && {
        dueDate: parseDateOnly(data.dueDate),
      }),
      ...(assignee !== null && {
        assignedTo: assignee.assignedTo,
        assignedInviteId: assignee.assignedInviteId,
      }),
      ...(data.timingTag !== undefined && {
        timingTag: data.timingTag || null,
      }),
    })
    .where(eq(eventPlanTasks.id, taskId));

  // A reassignment is news; an edit that leaves the assignee alone is not, so
  // this is guarded on `assignee` being non-null (i.e. `assignedTo` was in the
  // patch) and on the id actually changing.
  if (
    assignee?.assignedTo &&
    assignee.assignedTo !== task.assignedTo
  ) {
    const assigneeId = assignee.assignedTo;
    const title = data.title ?? task.title;
    after(() =>
      notifyEventPlanTaskAssigned({
        eventPlanId: task.eventPlanId,
        assigneeId,
        actorId: user.id!,
        title,
      })
    );
  }

  revalidatePath(`/events/plans/${task.eventPlanId}`);
}

export async function toggleEventPlanTask(taskId: string) {
  const user = await assertAuthenticated();

  const task = await db.query.eventPlanTasks.findFirst({
    where: eq(eventPlanTasks.id, taskId),
  });
  if (!task) throw new Error("Task not found");

  await assertEventPlanWriteAccess(user.id!, task.eventPlanId);

  await db
    .update(eventPlanTasks)
    .set({ completed: !task.completed })
    .where(eq(eventPlanTasks.id, taskId));

  revalidatePath(`/events/plans/${task.eventPlanId}`);
}

export async function deleteEventPlanTask(taskId: string) {
  const user = await assertAuthenticated();

  const task = await db.query.eventPlanTasks.findFirst({
    where: eq(eventPlanTasks.id, taskId),
  });
  if (!task) throw new Error("Task not found");

  await assertEventPlanWriteAccess(user.id!, task.eventPlanId, ["lead"]);

  await db.delete(eventPlanTasks).where(eq(eventPlanTasks.id, taskId));

  revalidatePath(`/events/plans/${task.eventPlanId}`);
}

/**
 * The recurring event's key tasks that this plan hasn't got, for the offer on
 * the plan's task list.
 *
 * Key tasks are *copied* onto a plan at creation, which means a task added to
 * the recurring event in March never reaches the plan opened in August. Rather
 * than re-syncing behind the board's back — which would resurrect a task a lead
 * deliberately deleted — the difference is shown and adding it is a click.
 */
export async function getMissingCatalogKeyTasks(eventPlanId: string): Promise<{
  titles: string[];
  catalogTitle: string | null;
}> {
  const user = await assertAuthenticated();
  // A read for anyone who can open the plan; the write below is stricter.
  await assertEventPlanAccess(user.id!, eventPlanId);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
    columns: { eventCatalogId: true },
    with: { catalogEntry: { columns: { title: true, keyTasks: true } } },
  });
  if (!plan?.catalogEntry) return { titles: [], catalogTitle: null };

  return {
    titles: await missingCatalogKeyTasks(
      eventPlanId,
      plan.catalogEntry.keyTasks
    ),
    catalogTitle: plan.catalogEntry.title,
  };
}

/**
 * Add those tasks to the plan.
 *
 * Re-reads the catalog rather than trusting a list of titles from the client —
 * this writes rows to a plan, and "whatever the browser sent" is not a source
 * of truth for what the recurring event says.
 */
export async function importCatalogKeyTasks(eventPlanId: string) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
    columns: { id: true },
    with: { catalogEntry: { columns: { keyTasks: true } } },
  });
  if (!plan?.catalogEntry) {
    throw new Error("This plan isn't filed under a recurring event");
  }

  const titles = await missingCatalogKeyTasks(
    eventPlanId,
    plan.catalogEntry.keyTasks
  );
  const added = await appendPlanTasks(eventPlanId, titles, user.id!);

  revalidatePath(`/events/plans/${eventPlanId}`);
  return { added };
}

export async function bulkCreateEventPlanTasks(
  eventPlanId: string,
  tasks: { title: string; description?: string; timingTag?: TaskTimingTag }[]
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId);

  if (tasks.length === 0) return;

  // Get max sortOrder to add new tasks at the end
  const maxOrderResult = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${eventPlanTasks.sortOrder}), -1)` })
    .from(eventPlanTasks)
    .where(eq(eventPlanTasks.eventPlanId, eventPlanId));
  const startOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

  await db.insert(eventPlanTasks).values(
    tasks.map((t, index) => ({
      eventPlanId,
      title: t.title,
      description: t.description || null,
      timingTag: t.timingTag || null,
      sortOrder: startOrder + index,
      createdBy: user.id!,
    }))
  );

  revalidatePath(`/events/plans/${eventPlanId}`);
}

export async function reorderEventPlanTasks(
  eventPlanId: string,
  taskIds: string[]
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId);

  // Update sortOrder for each task based on array position
  await Promise.all(
    taskIds.map((taskId, index) =>
      db
        .update(eventPlanTasks)
        .set({ sortOrder: index })
        .where(
          and(
            eq(eventPlanTasks.id, taskId),
            eq(eventPlanTasks.eventPlanId, eventPlanId)
          )
        )
    )
  );

  revalidatePath(`/events/plans/${eventPlanId}`);
}

// ─── Messages ──────────────────────────────────────────────────────────────

export async function sendEventPlanMessage(
  eventPlanId: string,
  message: string
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId);

  // Insert user message
  await db.insert(eventPlanMessages).values({
    eventPlanId,
    authorId: user.id!,
    message,
    isAiResponse: false,
  });

  after(async () => {
    const plan = await db.query.eventPlans.findFirst({
      where: eq(eventPlans.id, eventPlanId),
      columns: { title: true, schoolId: true },
    });
    if (!plan?.schoolId) return;
    await notifyMessagePosted({
      type: "event_plan_message",
      schoolId: plan.schoolId,
      recipients: await eventPlanRecipients(eventPlanId),
      actorId: user.id!,
      contextName: plan.title,
      message,
      url: `/events/plans/${eventPlanId}`,
      groupKey: `event_plan_message:${eventPlanId}`,
    });
  });

  // Check for @dragonhub mention
  const mentionRegex = /@dragonhub\b/i;
  if (mentionRegex.test(message)) {
    // Extract the question (remove the @dragonhub tag)
    const question = message.replace(mentionRegex, "").trim();

    if (question.length > 0) {
      // Rate limiting: max 10 AI messages per event per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentAiMessages = await db
        .select({ count: sql<number>`count(*)` })
        .from(eventPlanMessages)
        .where(
          and(
            eq(eventPlanMessages.eventPlanId, eventPlanId),
            eq(eventPlanMessages.isAiResponse, true),
            gte(eventPlanMessages.createdAt, oneHourAgo)
          )
        );

      const aiMessageCount = recentAiMessages[0]?.count ?? 0;

      if (aiMessageCount >= 10) {
        // Rate limit exceeded - insert a notice
        await db.insert(eventPlanMessages).values({
          eventPlanId,
          authorId: null,
          message:
            "I've reached my limit of 10 responses per hour for this event. Please try again later!",
          isAiResponse: true,
          aiSources: null,
        });
      } else {
        try {
          const aiResponse = await generateDiscussionAiResponse(
            eventPlanId,
            question
          );

          // Insert AI response
          await db.insert(eventPlanMessages).values({
            eventPlanId,
            authorId: null,
            message: aiResponse.message,
            isAiResponse: true,
            aiSources:
              aiResponse.sourcesUsed.length > 0
                ? JSON.stringify(aiResponse.sourcesUsed)
                : null,
          });
        } catch (error) {
          console.error("AI discussion response failed:", error);
          // Insert error message so user knows it failed
          await db.insert(eventPlanMessages).values({
            eventPlanId,
            authorId: null,
            message:
              "Sorry, I wasn't able to process that question. Please try again.",
            isAiResponse: true,
            aiSources: null,
          });
        }
      }
    }
  }

  revalidatePath(`/events/plans/${eventPlanId}`);
}

export async function deleteEventPlanMessage(messageId: string) {
  const user = await assertAuthenticated();

  // Find the message
  const message = await db.query.eventPlanMessages.findFirst({
    where: eq(eventPlanMessages.id, messageId),
  });
  if (!message) throw new Error("Message not found");

  // Only leads can delete AI messages
  if (message.isAiResponse) {
    await assertEventPlanWriteAccess(user.id!, message.eventPlanId, ["lead"]);
  } else {
    // Users can only delete their own messages
    if (message.authorId !== user.id) {
      throw new Error("Not authorized to delete this message");
    }
    // ...and only while the plan is still open. Authorship doesn't outrank the
    // completed-plan lock: the discussion is part of the record too.
    await assertEventPlanWriteAccess(user.id!, message.eventPlanId);
  }

  await db
    .delete(eventPlanMessages)
    .where(eq(eventPlanMessages.id, messageId));

  revalidatePath(`/events/plans/${message.eventPlanId}`);
}

// ─── Resources ─────────────────────────────────────────────────────────────

export async function addEventPlanResource(
  eventPlanId: string,
  data: {
    knowledgeArticleId?: string;
    /** Set when the resource is an indexed document (upload or Drive link). */
    documentId?: string;
    title: string;
    url?: string;
    notes?: string;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanWriteAccess(user.id!, eventPlanId);

  await db.insert(eventPlanResources).values({
    eventPlanId,
    knowledgeArticleId: data.knowledgeArticleId || null,
    documentId: data.documentId || null,
    title: data.title,
    url: data.url || null,
    notes: data.notes || null,
    addedBy: user.id!,
  });

  revalidatePath(`/events/plans/${eventPlanId}`);
}

export async function removeEventPlanResource(resourceId: string) {
  const user = await assertAuthenticated();

  const resource = await db.query.eventPlanResources.findFirst({
    where: eq(eventPlanResources.id, resourceId),
  });
  if (!resource) throw new Error("Resource not found");

  await assertEventPlanWriteAccess(user.id!, resource.eventPlanId, ["lead"]);

  if (resource.documentId) {
    // The resource is a document someone uploaded or linked here. Removing it
    // removes the document itself — leaving the index row behind would strand
    // a file with no way to reach or delete it. The FK cascade takes the
    // resource row with it.
    const { deleteDocument } = await import("@/actions/documents");
    await deleteDocument(resource.documentId);
  } else {
    await db
      .delete(eventPlanResources)
      .where(eq(eventPlanResources.id, resourceId));
  }

  revalidatePath(`/events/plans/${resource.eventPlanId}`);
}
