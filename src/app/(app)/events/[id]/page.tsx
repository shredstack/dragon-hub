import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventPlans,
  eventPlanMembers,
  eventPlanTasks,
  eventPlanMessages,
  eventPlanApprovals,
  eventPlanResources,
  eventPlanMeetings,
  schoolGoogleIntegrations,
  driveFileIndex,
  users,
} from "@/lib/db/schema";
import { documentUrl } from "@/lib/documents/index-document";
import { eq, and, isNull, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { assertEventPlanAccess } from "@/lib/auth-helpers";
import { getPendingInvitesForPlan } from "@/lib/event-plan-invites";
import { EventPlanTabs } from "@/components/event-plans/event-plan-tabs";
import { EventPlanOverview } from "@/components/event-plans/event-plan-overview";
import { EventPlanTaskList } from "@/components/event-plans/event-plan-task-list";
import { EventPlanMessageBoard } from "@/components/event-plans/event-plan-message-board";
import { EventPlanMembers } from "@/components/event-plans/event-plan-members";
import { EventPlanResources } from "@/components/event-plans/event-plan-resources";
import { SavedRecommendationsTab } from "@/components/event-plans/saved-recommendations-tab";
import { EventPlanMeetings } from "@/components/event-plans/event-plan-meetings";
import { EventPlanWrapUp } from "@/components/event-plans/event-plan-wrap-up";
import { CloneEventPlanDialog } from "@/components/event-plans/clone-event-plan-dialog";
import { Button } from "@/components/ui/button";
import {
  getEventPlanWrapUp,
  getPriorYearPlan,
  hasPlanForSchoolYear,
} from "@/actions/event-plans";
import { listEventRecommendations } from "@/actions/event-plan-ai";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getSchoolTagOptions } from "@/lib/tag-options";
import { UserPlus, Repeat, History } from "lucide-react";
import Link from "next/link";
import type {
  EventPlanStatus,
  EventPlanMemberRole,
  EventPlanLeadType,
  MeetingStatus,
  MeetingRsvpStatus,
} from "@/types";

interface EventPlanPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventPlanPage({ params }: EventPlanPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  // The gate for the whole page: PTA board and school admins pass, as does
  // anyone explicitly added to this plan. Everyone else gets a 404 rather than
  // a 403 — a plan they can't open shouldn't confirm it exists. This also
  // covers the school check, so a plan from another school is never reachable
  // by guessing its URL.
  const access = await assertEventPlanAccess(userId, id).catch(() => null);
  if (!access) notFound();
  const isBoardMember = access.isBoardMember;

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
    with: {
      catalogEntry: { columns: { id: true, title: true } },
    },
  });
  if (!plan) notFound();

  // Fetch data in parallel
  const [members, tasks, messages, approvals, resources, meetings] = await Promise.all([
    db
      .select({
        id: eventPlanMembers.id,
        userId: eventPlanMembers.userId,
        role: eventPlanMembers.role,
        leadType: eventPlanMembers.leadType,
        placeholderName: eventPlanMembers.placeholderName,
        placeholderEmail: eventPlanMembers.placeholderEmail,
        userName: users.name,
        userEmail: users.email,
      })
      .from(eventPlanMembers)
      // Left, not inner: a committee chair assigned before they had an account
      // is a placeholder row with no user to join to, and dropping them would
      // make the board's own assignment invisible on the plan it was made for.
      .leftJoin(users, eq(eventPlanMembers.userId, users.id))
      .where(eq(eventPlanMembers.eventPlanId, id)),
    db
      .select({
        id: eventPlanTasks.id,
        title: eventPlanTasks.title,
        description: eventPlanTasks.description,
        completed: eventPlanTasks.completed,
        dueDate: eventPlanTasks.dueDate,
        timingTag: eventPlanTasks.timingTag,
        sortOrder: eventPlanTasks.sortOrder,
        assigneeId: eventPlanTasks.assignedTo,
        assigneeName: users.name,
      })
      .from(eventPlanTasks)
      .leftJoin(users, eq(eventPlanTasks.assignedTo, users.id))
      .where(eq(eventPlanTasks.eventPlanId, id))
      .orderBy(asc(eventPlanTasks.sortOrder)),
    db
      .select({
        id: eventPlanMessages.id,
        message: eventPlanMessages.message,
        createdAt: eventPlanMessages.createdAt,
        authorId: eventPlanMessages.authorId,
        authorName: users.name,
        authorEmail: users.email,
        isAiResponse: eventPlanMessages.isAiResponse,
        aiSources: eventPlanMessages.aiSources,
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
        // Populated when the resource is an indexed document rather than a
        // bare link, so the tab can show its file type and indexing state.
        documentId: eventPlanResources.documentId,
        documentSource: driveFileIndex.source,
        documentFileName: driveFileIndex.fileName,
        documentMimeType: driveFileIndex.mimeType,
        documentFileSize: driveFileIndex.fileSize,
        documentBlobUrl: driveFileIndex.blobUrl,
        documentWebUrl: driveFileIndex.webUrl,
        documentStatus: driveFileIndex.processingStatus,
      })
      .from(eventPlanResources)
      .leftJoin(users, eq(eventPlanResources.addedBy, users.id))
      .leftJoin(
        driveFileIndex,
        eq(eventPlanResources.documentId, driveFileIndex.id)
      )
      .where(eq(eventPlanResources.eventPlanId, id)),
    db.query.eventPlanMeetings.findMany({
      // Archived meetings keep their notes and attachments in the database but
      // drop off the plan's meeting list.
      where: and(
        eq(eventPlanMeetings.eventPlanId, id),
        isNull(eventPlanMeetings.archivedAt)
      ),
      with: {
        participants: {
          with: { user: true },
        },
        notes: true,
        creator: true,
        documents: {
          // text_content and embedding are large; the card only needs
          // enough to render a link.
          columns: {
            id: true,
            fileName: true,
            title: true,
            mimeType: true,
            fileSize: true,
            source: true,
            blobUrl: true,
            webUrl: true,
            fileId: true,
            processingStatus: true,
          },
        },
      },
      orderBy: [asc(eventPlanMeetings.meetingDate)],
    }),
  ]);

  // Determine user's role
  const userMembership = members.find((m) => m.userId === userId);
  const isCreator = plan.createdBy === userId;
  const isLead =
    isCreator ||
    userMembership?.role === "lead" ||
    isBoardMember;

  // Mirrors assertEventPlanWriteAccess: once the event is completed the plan is
  // a record rather than a working document, so only its leads may still change
  // it — board members included. The board's way back in is Reopen.
  const isCompleted = plan.status === "completed";
  const isPlanLead = userMembership?.role === "lead";
  const canEdit = isCompleted ? isPlanLead : isLead;
  // Everyone who gets past the gate above is board or an invited member, so
  // the only remaining question is whether the plan is still open.
  const canInteract = isCompleted ? isPlanLead : true;
  const canReopen = isCompleted && isBoardMember;

  const leads = members
    .filter((m) => m.role === "lead")
    .map((m) => m.userName || m.placeholderName || m.userEmail || "Unnamed");

  const pendingInvites = (await getPendingInvitesForPlan(id)).map((invite) => ({
    id: invite.id,
    email: invite.email,
    name: invite.name,
    role: invite.role as EventPlanMemberRole,
    inviterName: invite.inviter?.name ?? null,
  }));

  const creatorUser = await db.query.users.findFirst({
    where: eq(users.id, plan.createdBy),
  });

  // Fetch saved AI recommendations
  const savedRecommendations = await listEventRecommendations(id);

  // Fetch service account email for resource sharing hint
  const googleIntegration = plan.schoolId
    ? await db.query.schoolGoogleIntegrations.findFirst({
        where: eq(schoolGoogleIntegrations.schoolId, plan.schoolId),
        columns: { serviceAccountEmail: true, active: true },
      })
    : null;
  const serviceAccountEmail =
    googleIntegration?.active ? googleIntegration.serviceAccountEmail : null;

  // Year-over-year context: the retrospective for this plan, and the most
  // recent earlier year of the same recurring event to copy from.
  const [wrapUp, priorYearPlan, currentSchoolYear] = await Promise.all([
    getEventPlanWrapUp(id),
    plan.eventCatalogId
      ? getPriorYearPlan(plan.eventCatalogId, plan.schoolYear)
      : Promise.resolve(null),
    plan.schoolId
      ? getSchoolCurrentYear(plan.schoolId)
      : Promise.resolve(plan.schoolYear),
  ]);

  // Copying forward is only an offer when this year has nothing yet. On the
  // current year's own plan — the common case — the button would produce a
  // second plan for a year that is already being planned right here.
  const currentYearPlanned = plan.eventCatalogId
    ? plan.schoolYear === currentSchoolYear ||
      (await hasPlanForSchoolYear(plan.eventCatalogId, currentSchoolYear))
    : true;

  // Tags are stored as slugs; the overview shows the school's display names.
  const tagOptions = plan.tags?.length
    ? await getSchoolTagOptions(plan.schoolId)
    : [];
  const tagLabels = Object.fromEntries(
    tagOptions.map((t) => [t.name, t.displayName])
  );

  const formattedMessages = messages.map((m) => ({
    id: m.id,
    message: m.message,
    createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
    authorId: m.authorId,
    author: m.authorName
      ? { name: m.authorName, email: m.authorEmail ?? "" }
      : null,
    isAiResponse: m.isAiResponse ?? false,
    aiSources: m.aiSources ? JSON.parse(m.aiSources) : null,
  }));

  const formattedTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    completed: t.completed ?? false,
    dueDate: t.dueDate?.toISOString() ?? null,
    timingTag: t.timingTag,
    sortOrder: t.sortOrder ?? 0,
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
    id: m.id,
    userId: m.userId,
    userName: m.userName || m.placeholderName || m.userEmail || "Unnamed",
    userEmail: m.userEmail ?? m.placeholderEmail ?? "",
    role: m.role as EventPlanMemberRole,
    leadType: m.leadType as EventPlanLeadType | null,
  }));

  // Anything that assigns work to a person needs a real account behind it, so
  // placeholders are offered on the roster but not as task assignees or meeting
  // participants — there is nobody to notify and nobody who can tick it off.
  const assignableMembers = formattedMembers.filter(
    (m): m is typeof m & { userId: string } => m.userId !== null
  );

  const formattedMeetings = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    location: m.location,
    meetingRoom: m.meetingRoom,
    meetingDate: m.meetingDate.toISOString(),
    startTime: m.startTime,
    endTime: m.endTime,
    topic: m.topic,
    agenda: m.agenda,
    status: m.status as MeetingStatus,
    googleDocUrl: m.googleDocUrl,
    createdBy: m.createdBy,
    creator: m.creator
      ? { name: m.creator.name, email: m.creator.email }
      : null,
    participants: m.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      rsvpStatus: p.rsvpStatus as MeetingRsvpStatus,
      user: {
        id: p.user.id,
        name: p.user.name,
        email: p.user.email,
      },
    })),
    notes: m.notes.map((n) => ({
      id: n.id,
      content: n.content,
      summary: n.summary,
      actionItems: n.actionItems,
      attendees: n.attendees,
    })),
    documents: m.documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      title: d.title,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      source: d.source,
      url: documentUrl(d),
      processingStatus: d.processingStatus,
    })),
  }));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{plan.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span>{plan.schoolYear}</span>
            {plan.catalogEntry && (
              <Link
                href="/admin/board/event-catalog"
                className="inline-flex items-center gap-1 text-sm hover:underline"
                title="This is one year of a recurring event"
              >
                <Repeat className="h-3.5 w-3.5" />
                {plan.catalogEntry.title}
              </Link>
            )}
            {plan.isOneOff && (
              <span className="text-sm">One-off event</span>
            )}
          </div>
        </div>

        {/* Copying forward only makes sense from a year that isn't this one,
            and creating next year's plan is the board's call. */}
        {isBoardMember && priorYearPlan && !currentYearPlanned && (
          <CloneEventPlanDialog
            sourcePlanId={priorYearPlan.id}
            sourceTitle={priorYearPlan.title}
            sourceSchoolYear={priorYearPlan.schoolYear}
            targetSchoolYear={currentSchoolYear}
          />
        )}
      </div>

      {priorYearPlan && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
          <History className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            This event also ran in {priorYearPlan.schoolYear} —{" "}
            <Link
              href={`/events/${priorYearPlan.id}`}
              className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
            >
              see what they did
            </Link>
            .
          </span>
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
              signupGeniusUrl: plan.signupGeniusUrl,
              tags: plan.tags,
              catalogEntry: plan.catalogEntry ?? null,
              isOneOff: plan.isOneOff,
              status: plan.status as EventPlanStatus,
              schoolYear: plan.schoolYear,
              creatorName: creatorUser?.name ?? null,
            }}
            tagLabels={tagLabels}
            canReopen={canReopen}
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
            canDelete={canEdit}
            canEdit={canInteract}
            members={assignableMembers.map((m) => ({
              userId: m.userId,
              userName: m.userName,
            }))}
          />
        }
        meetingsContent={
          <EventPlanMeetings
            eventPlanId={id}
            meetings={formattedMeetings}
            members={assignableMembers}
            currentUserId={userId}
            canCreate={canInteract}
            canManage={canEdit}
          />
        }
        discussionContent={
          <EventPlanMessageBoard
            eventPlanId={id}
            messages={formattedMessages}
            currentUserId={userId}
            canSend={canInteract}
            canDeleteAiMessages={canEdit}
          />
        }
        membersContent={
          <EventPlanMembers
            eventPlanId={id}
            members={formattedMembers}
            pendingInvites={canEdit ? pendingInvites : []}
            currentUserId={userId}
            canManage={canEdit}
          />
        }
        resourcesContent={
          <EventPlanResources
            eventPlanId={id}
            resources={resources.map((r) => ({
              id: r.id,
              title: r.title,
              url: r.documentBlobUrl || r.documentWebUrl || r.url,
              notes: r.notes,
              addedByName: r.addedByName,
              documentId: r.documentId,
              documentSource: r.documentSource,
              documentFileName: r.documentFileName,
              documentMimeType: r.documentMimeType,
              documentFileSize: r.documentFileSize,
              documentStatus: r.documentStatus,
            }))}
            canAdd={canInteract}
            canRemove={canEdit}
            serviceAccountEmail={serviceAccountEmail}
            hasCatalogEntry={Boolean(plan.eventCatalogId)}
          />
        }
        aiHistoryContent={
          <SavedRecommendationsTab
            eventPlanId={id}
            recommendations={savedRecommendations}
            currentUserId={userId}
            canDelete={canEdit}
            canInteract={canInteract}
          />
        }
        wrapUpContent={
          // Only worth asking once the event has happened.
          plan.status === "completed" || wrapUp ? (
            <EventPlanWrapUp
              eventPlanId={id}
              canEdit={canEdit}
              hasCatalogEntry={Boolean(plan.eventCatalogId)}
              catalogTitle={plan.catalogEntry?.title ?? null}
              initial={
                wrapUp
                  ? {
                      whatWorked: wrapUp.whatWorked,
                      whatToChange: wrapUp.whatToChange,
                      actualCost: wrapUp.actualCost,
                      actualVolunteers: wrapUp.actualVolunteers,
                      appliedToCatalog: wrapUp.appliedToCatalog,
                    }
                  : null
              }
            />
          ) : undefined
        }
      />
    </div>
  );
}
