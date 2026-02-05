import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventPlans,
  eventPlanMembers,
  eventPlanTasks,
  eventPlanMessages,
  eventPlanApprovals,
  eventPlanResources,
  users,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { isPtaBoard, isEventPlanMember } from "@/lib/auth-helpers";
import { EventPlanTabs } from "@/components/event-plans/event-plan-tabs";
import { EventPlanOverview } from "@/components/event-plans/event-plan-overview";
import { EventPlanTaskList } from "@/components/event-plans/event-plan-task-list";
import { EventPlanMessageBoard } from "@/components/event-plans/event-plan-message-board";
import { EventPlanMembers } from "@/components/event-plans/event-plan-members";
import { EventPlanResources } from "@/components/event-plans/event-plan-resources";
import { Button } from "@/components/ui/button";
import { joinEventPlan } from "@/actions/event-plans";
import { UserPlus } from "lucide-react";
import type { EventPlanStatus, EventPlanMemberRole } from "@/types";

interface EventPlanPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventPlanPage({ params }: EventPlanPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
  });
  if (!plan) notFound();

  const isBoardMember = await isPtaBoard(userId);
  const isMember = await isEventPlanMember(userId, id);

  // Fetch data in parallel
  const [members, tasks, messages, approvals, resources] = await Promise.all([
    db
      .select({
        userId: eventPlanMembers.userId,
        role: eventPlanMembers.role,
        userName: users.name,
        userEmail: users.email,
      })
      .from(eventPlanMembers)
      .innerJoin(users, eq(eventPlanMembers.userId, users.id))
      .where(eq(eventPlanMembers.eventPlanId, id)),
    db
      .select({
        id: eventPlanTasks.id,
        title: eventPlanTasks.title,
        description: eventPlanTasks.description,
        completed: eventPlanTasks.completed,
        dueDate: eventPlanTasks.dueDate,
        assigneeId: eventPlanTasks.assignedTo,
        assigneeName: users.name,
      })
      .from(eventPlanTasks)
      .leftJoin(users, eq(eventPlanTasks.assignedTo, users.id))
      .where(eq(eventPlanTasks.eventPlanId, id)),
    db
      .select({
        id: eventPlanMessages.id,
        message: eventPlanMessages.message,
        createdAt: eventPlanMessages.createdAt,
        authorId: eventPlanMessages.authorId,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(eventPlanMessages)
      .leftJoin(users, eq(eventPlanMessages.authorId, users.id))
      .where(eq(eventPlanMessages.eventPlanId, id))
      .orderBy(eventPlanMessages.createdAt),
    db
      .select({
        userId: eventPlanApprovals.userId,
        vote: eventPlanApprovals.vote,
        comment: eventPlanApprovals.comment,
        createdAt: eventPlanApprovals.createdAt,
        userName: users.name,
      })
      .from(eventPlanApprovals)
      .leftJoin(users, eq(eventPlanApprovals.userId, users.id))
      .where(eq(eventPlanApprovals.eventPlanId, id)),
    db
      .select({
        id: eventPlanResources.id,
        title: eventPlanResources.title,
        url: eventPlanResources.url,
        notes: eventPlanResources.notes,
        addedByName: users.name,
      })
      .from(eventPlanResources)
      .leftJoin(users, eq(eventPlanResources.addedBy, users.id))
      .where(eq(eventPlanResources.eventPlanId, id)),
  ]);

  // Determine user's role
  const userMembership = members.find((m) => m.userId === userId);
  const isCreator = plan.createdBy === userId;
  const isLead =
    isCreator ||
    userMembership?.role === "lead" ||
    isBoardMember;
  const canEdit = isLead;
  const canInteract = isMember;

  const leads = members
    .filter((m) => m.role === "lead")
    .map((m) => m.userName || m.userEmail);

  const creatorUser = await db.query.users.findFirst({
    where: eq(users.id, plan.createdBy),
  });

  const formattedMessages = messages.map((m) => ({
    id: m.id,
    message: m.message,
    createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
    authorId: m.authorId,
    author: m.authorName
      ? { name: m.authorName, email: m.authorEmail ?? "" }
      : null,
  }));

  const formattedTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    completed: t.completed ?? false,
    dueDate: t.dueDate?.toISOString() ?? null,
    assignee: t.assigneeName ? { name: t.assigneeName } : null,
  }));

  const formattedVotes = approvals.map((a) => ({
    userId: a.userId,
    userName: a.userName,
    vote: a.vote as "approve" | "reject",
    comment: a.comment,
    createdAt: a.createdAt?.toISOString() ?? new Date().toISOString(),
  }));

  const formattedMembers = members.map((m) => ({
    userId: m.userId,
    userName: m.userName || m.userEmail,
    userEmail: m.userEmail,
    role: m.role as EventPlanMemberRole,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{plan.title}</h1>
        <p className="text-muted-foreground">{plan.schoolYear}</p>
      </div>

      {!isMember && (
        <div className="mb-4 rounded-lg border border-dashed border-border bg-card p-4 text-center">
          <p className="mb-2 text-sm text-muted-foreground">
            Join this event to participate in discussions, tasks, and planning.
          </p>
          <form action={joinEventPlan.bind(null, id)}>
            <Button size="sm" type="submit">
              <UserPlus className="h-4 w-4" /> Join This Event
            </Button>
          </form>
        </div>
      )}

      <EventPlanTabs
        overviewContent={
          <EventPlanOverview
            eventPlan={{
              id: plan.id,
              title: plan.title,
              description: plan.description,
              eventType: plan.eventType,
              eventDate: plan.eventDate?.toISOString() ?? null,
              location: plan.location,
              budget: plan.budget,
              status: plan.status as EventPlanStatus,
              schoolYear: plan.schoolYear,
              creatorName: creatorUser?.name ?? null,
            }}
            leads={leads}
            votes={formattedVotes}
            currentUserId={userId}
            isBoardMember={isBoardMember}
            isLead={isLead}
            canEdit={canEdit}
            canInteract={canInteract}
          />
        }
        tasksContent={
          <EventPlanTaskList
            eventPlanId={id}
            tasks={formattedTasks}
            canCreate={canInteract}
            canDelete={isLead}
            members={formattedMembers.map((m) => ({
              userId: m.userId,
              userName: m.userName,
            }))}
          />
        }
        discussionContent={
          <EventPlanMessageBoard
            eventPlanId={id}
            messages={formattedMessages}
            currentUserId={userId}
            canSend={canInteract}
          />
        }
        membersContent={
          <EventPlanMembers
            eventPlanId={id}
            members={formattedMembers}
            currentUserId={userId}
            isMember={isMember}
            canManage={isLead}
          />
        }
        resourcesContent={
          <EventPlanResources
            eventPlanId={id}
            resources={resources.map((r) => ({
              id: r.id,
              title: r.title,
              url: r.url,
              notes: r.notes,
              addedByName: r.addedByName,
            }))}
            canAdd={canInteract}
            canRemove={isLead}
          />
        }
      />
    </div>
  );
}
