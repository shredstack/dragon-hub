import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCommitteeDetail } from "@/actions/committees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock } from "lucide-react";
import { CommitteeTabs } from "@/components/committees/committee-tabs";
import { getCommitteeResources } from "@/actions/knowledge";
import { getCurrentSchoolId, isSchoolPtaBoardOrAdmin } from "@/lib/auth-helpers";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CommitteeWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  let detail;
  try {
    // `assertCommitteeAccess` throws for non-members and across school
    // boundaries alike; either way the committee doesn't exist as far as this
    // person is concerned.
    detail = await getCommitteeDetail(id);
  } catch {
    notFound();
  }

  const { committee, isChair, messages, tasks, members, waitlist, schedule, scheduleClassrooms } =
    detail;

  const schoolId = await getCurrentSchoolId();
  const [resources, canShareResources] = await Promise.all([
    getCommitteeResources(id),
    schoolId ? isSchoolPtaBoardOrAdmin(userId, schoolId) : false,
  ]);

  const linkedHref =
    committee.scope === "classroom" && committee.classroomId
      ? `/classrooms/${committee.classroomId}`
      : committee.scope === "event_plan" && committee.eventPlanId
        ? `/events/${committee.eventPlanId}`
        : null;

  return (
    <div>
      <Link
        href="/committees"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All committees
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {committee.iconEmoji && (
              <span className="mr-2">{committee.iconEmoji}</span>
            )}
            {committee.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {linkedHref ? (
              <Link href={linkedHref}>
                <Badge variant="outline">{committee.scopeLabel} →</Badge>
              </Link>
            ) : (
              <Badge variant="outline">{committee.scopeLabel}</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {committee.schoolYear}
            </span>
            {committee.status === "closed" && (
              <Badge variant="secondary">Closed to new members</Badge>
            )}
          </div>
          {committee.description && (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              {committee.description}
            </p>
          )}
        </div>

        {/* Prefills the category and event name — the parts the app already
            knows. The volunteer still enters hours and date. */}
        <Link href={`/volunteer-hours/submit?committeeId=${committee.id}`}>
          <Button variant="outline" size="sm">
            <Clock className="h-4 w-4" /> Log hours
          </Button>
        </Link>
      </div>

      <CommitteeTabs
        committeeId={committee.id}
        currentUserId={userId}
        messages={messages}
        tasks={tasks}
        taskMembers={members
          .filter((m) => m.userId)
          .map((m) => ({ userId: m.userId!, name: m.name }))}
        roster={{ members, waitlist, canManage: isChair }}
        isChair={isChair}
        schedule={
          committee.schedulingEnabled
            ? { slots: schedule, classroomOptions: scheduleClassrooms }
            : undefined
        }
        resources={resources}
        canShareResources={canShareResources}
      />
    </div>
  );
}
