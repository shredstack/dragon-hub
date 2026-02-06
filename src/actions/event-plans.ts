"use server";

import {
  assertAuthenticated,
  assertEventPlanAccess,
  assertPtaBoard,
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
} from "@/lib/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import type { TaskTimingTag } from "@/types";
import { revalidatePath } from "next/cache";
import { APPROVAL_THRESHOLD } from "@/lib/constants";
import type { EventPlanMemberRole } from "@/types";

// ─── Event Plan CRUD ───────────────────────────────────────────────────────

export async function createEventPlan(data: {
  title: string;
  description?: string;
  eventType?: string;
  eventDate?: string;
  location?: string;
  budget?: string;
  schoolYear: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const [plan] = await db
    .insert(eventPlans)
    .values({
      schoolId,
      title: data.title,
      description: data.description || null,
      eventType: data.eventType || null,
      eventDate: data.eventDate ? new Date(data.eventDate) : null,
      location: data.location || null,
      budget: data.budget || null,
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

  revalidatePath("/events");
  return plan;
}

export async function updateEventPlan(
  id: string,
  data: {
    title?: string;
    description?: string;
    eventType?: string;
    eventDate?: string;
    location?: string;
    budget?: string;
  }
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, id, ["lead"]);

  await db
    .update(eventPlans)
    .set({
      ...(data.title !== undefined && { title: data.title }),
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
      updatedAt: new Date(),
    })
    .where(eq(eventPlans.id, id));

  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
}

export async function deleteEventPlan(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, id), eq(eventPlans.schoolId, schoolId)),
  });
  if (!plan) throw new Error("Event plan not found");

  const isBoardMember = await assertPtaBoard(user.id!).then(
    () => true,
    () => false
  );
  if (plan.createdBy !== user.id && !isBoardMember) {
    throw new Error("Unauthorized: Only the creator or board can delete");
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

  await db
    .update(eventPlans)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(eventPlans.id, id));

  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
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

  await db.insert(eventPlanMessages).values({
    eventPlanId,
    authorId: user.id!,
    message,
  });

  revalidatePath(`/events/${eventPlanId}`);
}

// ─── Resources ─────────────────────────────────────────────────────────────

export async function addEventPlanResource(
  eventPlanId: string,
  data: {
    knowledgeArticleId?: string;
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

  await db
    .delete(eventPlanResources)
    .where(eq(eventPlanResources.id, resourceId));

  revalidatePath(`/events/${resource.eventPlanId}`);
}
