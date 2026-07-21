"use server";

import {
  assertAuthenticated,
  assertEventPlanAccess,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventPlans,
  eventPlanMembers,
  eventPlanTasks,
  eventPlanMessages,
  eventPlanApprovals,
  eventPlanResources,
  eventPlanWrapUps,
  eventContactLinks,
  eventCatalog,
} from "@/lib/db/schema";
import { and, eq, sql, gte, desc, asc, isNull } from "drizzle-orm";
import type { TaskTimingTag } from "@/types";
import { revalidatePath } from "next/cache";
import {
  APPROVAL_THRESHOLD,
  canDeleteEventPlanStatus,
} from "@/lib/constants";
import type { EventPlanMemberRole } from "@/types";
import { assertHttpUrl, parseStoredList, serializeList } from "@/lib/utils";
import { normalizeTags } from "@/lib/tags";
import { ensureTagsExist, syncTagUsage } from "./tags";
import { stampContactUsage } from "@/lib/contacts/usage";
import { generateDiscussionAiResponse } from "./event-plan-ai";

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
  location?: string;
  budget?: string;
  tags?: string[];
  schoolYear: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

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

  const [plan] = await db
    .insert(eventPlans)
    .values({
      schoolId,
      title: data.title,
      description: data.description || null,
      eventType: data.eventType || null,
      eventCatalogId: data.eventCatalogId || null,
      isOneOff: data.isOneOff ?? false,
      eventDate: data.eventDate ? new Date(data.eventDate) : null,
      location: data.location || null,
      budget: data.budget || null,
      tags: tags.length > 0 ? tags : null,
      schoolYear: data.schoolYear,
      createdBy: user.id!,
    })
    .returning();

  // Auto-add creator as lead
  await db.insert(eventPlanMembers).values({
    eventPlanId: plan.id,
    userId: user.id!,
    role: "lead",
  });

  if (tags.length > 0) await ensureTagsExist(tags);

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
    location?: string;
    budget?: string;
    tags?: string[];
    signupGeniusUrl?: string;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, id, ["lead"]);

  if (data.signupGeniusUrl) {
    assertHttpUrl(data.signupGeniusUrl);
  }

  const existing = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
    columns: { schoolId: true, tags: true },
  });
  if (!existing) throw new Error("Event plan not found");

  if (data.eventCatalogId && existing.schoolId) {
    await assertCatalogEntryInSchool(data.eventCatalogId, existing.schoolId);
  }

  const tags = data.tags !== undefined ? normalizeTags(data.tags) : undefined;

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
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
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

  revalidatePath(`/events/${id}`);
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, id), eq(eventPlans.schoolId, schoolId)),
  });
  if (!plan) throw new Error("Event plan not found");

  if (!canDeleteEventPlanStatus(plan.status)) {
    throw new Error(
      `An ${plan.status} event plan can't be deleted. Its approval history and documents are part of the school's record.`
    );
  }

  await db.delete(eventPlans).where(eq(eventPlans.id, id));

  revalidatePath("/events");
}

// ─── Status Transitions ────────────────────────────────────────────────────

export async function submitForApproval(id: string) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, id, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
  });
  if (!plan) throw new Error("Event plan not found");
  if (plan.status !== "draft" && plan.status !== "rejected") {
    throw new Error("Only draft or rejected plans can be submitted for approval");
  }

  // Clear any previous votes if resubmitting
  await db
    .delete(eventPlanApprovals)
    .where(eq(eventPlanApprovals.eventPlanId, id));

  await db
    .update(eventPlans)
    .set({ status: "pending_approval", updatedAt: new Date() })
    .where(eq(eventPlans.id, id));

  revalidatePath(`/events/${id}`);
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  if (vote === "reject") {
    await db
      .update(eventPlans)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(eventPlans.id, id));
  } else {
    // Count approvals, auto-approve if threshold met
    const approvals = await db.query.eventPlanApprovals.findMany({
      where: and(
        eq(eventPlanApprovals.eventPlanId, id),
        eq(eventPlanApprovals.vote, "approve")
      ),
    });

    if (approvals.length >= APPROVAL_THRESHOLD) {
      await db
        .update(eventPlans)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(eventPlans.id, id));
    }
  }

  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
}

export async function completeEventPlan(id: string) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, id, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
    columns: { schoolYear: true },
  });

  await db
    .update(eventPlans)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(eventPlans.id, id));

  // Mark every contact this event used as current, so a vendor nobody has
  // called in three years is visible as such in the directory.
  if (plan) await stampContactUsage(id, plan.schoolYear);

  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
  revalidatePath("/admin/contacts");
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
      eventDate: options.eventDate ? new Date(options.eventDate) : null,
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

  await db.insert(eventPlanMembers).values({
    eventPlanId: plan.id,
    userId: user.id!,
    role: "lead",
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
      const shiftMs =
        options.eventDate && source.eventDate
          ? new Date(options.eventDate).getTime() -
            new Date(source.eventDate).getTime()
          : null;

      await db.insert(eventPlanTasks).values(
        tasks.map((task, index) => ({
          eventPlanId: plan.id,
          title: task.title,
          description: task.description,
          dueDate:
            shiftMs !== null && task.dueDate
              ? new Date(new Date(task.dueDate).getTime() + shiftMs)
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

  if (options.includeMembers) {
    const members = await db.query.eventPlanMembers.findMany({
      where: eq(eventPlanMembers.eventPlanId, sourcePlanId),
    });

    const carried = members.filter((m) => m.userId !== user.id!);
    if (carried.length > 0) {
      await db.insert(eventPlanMembers).values(
        carried.map((member) => ({
          eventPlanId: plan.id,
          userId: member.userId,
          role: member.role,
        }))
      );
    }
  }

  if (tags.length > 0) await ensureTagsExist(tags);

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
 * Record what was learned running this event, and fold it into the recurring
 * event so next year's lead starts from it.
 *
 * This is what keeps the catalog honest. Without it, a recurring event's tips
 * and estimates are whatever somebody typed once, years ago, and the whole
 * year-over-year story quietly stops being true.
 */
export async function saveEventPlanWrapUp(
  eventPlanId: string,
  data: {
    whatWorked?: string;
    whatToChange?: string;
    actualCost?: string;
    actualVolunteers?: string;
    /** Merge the notes into the recurring event's tips and estimates. */
    applyToCatalog?: boolean;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId, ["lead"]);

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

  const shouldApply =
    data.applyToCatalog &&
    plan.eventCatalogId &&
    // Applying twice would stack the same paragraph onto the tips each save.
    !existing?.appliedToCatalog;

  if (shouldApply) {
    const entry = await db.query.eventCatalog.findFirst({
      where: eq(eventCatalog.id, plan.eventCatalogId!),
    });

    if (entry) {
      // Tips are stored as a JSON array, so the year's lessons go in as their
      // own entries rather than concatenated text — otherwise the catalog page
      // that parses this column drops every tip on the entry.
      const learned = [values.whatWorked, values.whatToChange]
        .filter((text): text is string => Boolean(text))
        .map((text) => `From ${plan.schoolYear}: ${text.trim()}`);

      await db
        .update(eventCatalog)
        .set({
          tips:
            learned.length > 0
              ? serializeList([...parseStoredList(entry.tips), ...learned])
              : entry.tips,
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
        .set({ appliedToCatalog: true })
        .where(eq(eventPlanWrapUps.eventPlanId, eventPlanId));
    }
  }

  revalidatePath(`/events/${eventPlanId}`);
  revalidatePath("/admin/board/event-catalog");
  return { success: true, appliedToCatalog: Boolean(shouldApply) };
}

// ─── Member Management ─────────────────────────────────────────────────────

export async function addEventPlanMember(
  eventPlanId: string,
  userId: string,
  role: EventPlanMemberRole
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId, ["lead"]);

  await db.insert(eventPlanMembers).values({
    eventPlanId,
    userId,
    role,
  });

  revalidatePath(`/events/${eventPlanId}`);
}

export async function removeEventPlanMember(
  eventPlanId: string,
  userId: string
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId, ["lead"]);

  // Prevent removing the last lead
  const leads = await db.query.eventPlanMembers.findMany({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.role, "lead")
    ),
  });
  const isRemovingLead = leads.some((l) => l.userId === userId);
  if (isRemovingLead && leads.length <= 1) {
    throw new Error("Cannot remove the last lead");
  }

  await db
    .delete(eventPlanMembers)
    .where(
      and(
        eq(eventPlanMembers.eventPlanId, eventPlanId),
        eq(eventPlanMembers.userId, userId)
      )
    );

  revalidatePath(`/events/${eventPlanId}`);
}

export async function updateEventPlanMemberRole(
  eventPlanId: string,
  userId: string,
  role: EventPlanMemberRole
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId, ["lead"]);

  // Prevent demoting the last lead
  if (role === "member") {
    const leads = await db.query.eventPlanMembers.findMany({
      where: and(
        eq(eventPlanMembers.eventPlanId, eventPlanId),
        eq(eventPlanMembers.role, "lead")
      ),
    });
    const isDemotingLead = leads.some((l) => l.userId === userId);
    if (isDemotingLead && leads.length <= 1) {
      throw new Error("Cannot demote the last lead");
    }
  }

  await db
    .update(eventPlanMembers)
    .set({ role })
    .where(
      and(
        eq(eventPlanMembers.eventPlanId, eventPlanId),
        eq(eventPlanMembers.userId, userId)
      )
    );

  revalidatePath(`/events/${eventPlanId}`);
}

export async function joinEventPlan(eventPlanId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, eventPlanId), eq(eventPlans.schoolId, schoolId)),
  });
  if (!plan) throw new Error("Event plan not found");

  // Check if already a member
  const existing = await db.query.eventPlanMembers.findFirst({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.userId, user.id!)
    ),
  });
  if (existing) return; // Already a member

  await db.insert(eventPlanMembers).values({
    eventPlanId,
    userId: user.id!,
    role: "member",
  });

  revalidatePath(`/events/${eventPlanId}`);
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

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
  await assertEventPlanAccess(user.id!, eventPlanId);

  // Get max sortOrder to add new task at the end
  const maxOrderResult = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${eventPlanTasks.sortOrder}), -1)` })
    .from(eventPlanTasks)
    .where(eq(eventPlanTasks.eventPlanId, eventPlanId));
  const nextOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

  await db.insert(eventPlanTasks).values({
    eventPlanId,
    title: data.title,
    description: data.description || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    assignedTo: data.assignedTo || null,
    timingTag: data.timingTag || null,
    sortOrder: nextOrder,
    createdBy: user.id!,
  });

  revalidatePath(`/events/${eventPlanId}`);
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

  await assertEventPlanAccess(user.id!, task.eventPlanId);

  await db
    .update(eventPlanTasks)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.dueDate !== undefined && {
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      }),
      ...(data.assignedTo !== undefined && {
        assignedTo: data.assignedTo || null,
      }),
      ...(data.timingTag !== undefined && {
        timingTag: data.timingTag || null,
      }),
    })
    .where(eq(eventPlanTasks.id, taskId));

  revalidatePath(`/events/${task.eventPlanId}`);
}

export async function toggleEventPlanTask(taskId: string) {
  const user = await assertAuthenticated();

  const task = await db.query.eventPlanTasks.findFirst({
    where: eq(eventPlanTasks.id, taskId),
  });
  if (!task) throw new Error("Task not found");

  await assertEventPlanAccess(user.id!, task.eventPlanId);

  await db
    .update(eventPlanTasks)
    .set({ completed: !task.completed })
    .where(eq(eventPlanTasks.id, taskId));

  revalidatePath(`/events/${task.eventPlanId}`);
}

export async function deleteEventPlanTask(taskId: string) {
  const user = await assertAuthenticated();

  const task = await db.query.eventPlanTasks.findFirst({
    where: eq(eventPlanTasks.id, taskId),
  });
  if (!task) throw new Error("Task not found");

  await assertEventPlanAccess(user.id!, task.eventPlanId, ["lead"]);

  await db.delete(eventPlanTasks).where(eq(eventPlanTasks.id, taskId));

  revalidatePath(`/events/${task.eventPlanId}`);
}

export async function bulkCreateEventPlanTasks(
  eventPlanId: string,
  tasks: { title: string; description?: string; timingTag?: TaskTimingTag }[]
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);

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

  revalidatePath(`/events/${eventPlanId}`);
}

export async function reorderEventPlanTasks(
  eventPlanId: string,
  taskIds: string[]
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);

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

  revalidatePath(`/events/${eventPlanId}`);
}

// ─── Messages ──────────────────────────────────────────────────────────────

export async function sendEventPlanMessage(
  eventPlanId: string,
  message: string
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);

  // Insert user message
  await db.insert(eventPlanMessages).values({
    eventPlanId,
    authorId: user.id!,
    message,
    isAiResponse: false,
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

  revalidatePath(`/events/${eventPlanId}`);
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
    await assertEventPlanAccess(user.id!, message.eventPlanId, ["lead"]);
  } else {
    // Users can only delete their own messages
    if (message.authorId !== user.id) {
      throw new Error("Not authorized to delete this message");
    }
  }

  await db
    .delete(eventPlanMessages)
    .where(eq(eventPlanMessages.id, messageId));

  revalidatePath(`/events/${message.eventPlanId}`);
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
  await assertEventPlanAccess(user.id!, eventPlanId);

  await db.insert(eventPlanResources).values({
    eventPlanId,
    knowledgeArticleId: data.knowledgeArticleId || null,
    documentId: data.documentId || null,
    title: data.title,
    url: data.url || null,
    notes: data.notes || null,
    addedBy: user.id!,
  });

  revalidatePath(`/events/${eventPlanId}`);
}

export async function removeEventPlanResource(resourceId: string) {
  const user = await assertAuthenticated();

  const resource = await db.query.eventPlanResources.findFirst({
    where: eq(eventPlanResources.id, resourceId),
  });
  if (!resource) throw new Error("Resource not found");

  await assertEventPlanAccess(user.id!, resource.eventPlanId, ["lead"]);

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

  revalidatePath(`/events/${resource.eventPlanId}`);
}
