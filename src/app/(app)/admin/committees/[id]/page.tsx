import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getCommitteeAdminDetail } from "@/actions/committees";
import { Badge } from "@/components/ui/badge";
import { CommitteeActions } from "./committee-actions";
import { getBoardPositionsWithSeed } from "@/lib/board-positions";
import { JoinQrSection } from "./join-qr-section";
import { RosterTable } from "./roster-table";
import { WaitlistTable } from "./waitlist-table";
import { ClassroomCoverageTable } from "./classroom-coverage";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "secondary"> = {
  draft: "secondary",
  active: "success",
  closed: "default",
};

export default async function AdminCommitteeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  let detail;
  try {
    detail = await getCommitteeAdminDetail(id);
  } catch {
    notFound();
  }

  const { config, members, waitlist, joinCode, joinUrl, qrDataUrl, classroomCoverage } =
    detail;

  // An "every classroom" committee is measured per room, not as one roster, so
  // its stats, its add-by-hand dialog and its waitlist all key off the coverage.
  const filledByClassroom = classroomCoverage
    ? Object.fromEntries(
        classroomCoverage.rooms.map((r) => [r.classroom.id, r.filled])
      )
    : {};

  const seatsRemaining =
    config.capacityMode === "capped" && config.maxSize !== null
      ? Math.max(0, config.maxSize - members.length)
      : null;
  const stillNeeded = config.minSize
    ? Math.max(0, config.minSize - members.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {config.iconEmoji && <span className="mr-2">{config.iconEmoji}</span>}
            {config.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[config.status] ?? "default"}>
              {config.status}
            </Badge>
            <Badge variant="outline">{detail.committee.scopeLabel}</Badge>
            {config.showOnRoomParentSignup && (
              <Badge variant="outline">On room parent sign-up</Badge>
            )}
            {stillNeeded > 0 && (
              <Badge variant="warning">Needs {stillNeeded} more</Badge>
            )}
            {config.archivedAt && <Badge variant="secondary">Archived</Badge>}
          </div>
          {config.description && (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              {config.description}
            </p>
          )}
        </div>

        <CommitteeActions
          config={config}
          positions={await getBoardPositionsWithSeed(schoolId)}
          classroomOptions={detail.classroomOptions}
          eventPlanOptions={detail.eventPlanOptions}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Members"
          value={
            config.capacityMode === "capped" && config.maxSize !== null
              ? `${members.length} of ${config.maxSize}`
              : `${members.length}`
          }
        />
        <Stat label="On the waitlist" value={`${waitlist.length}`} />
        {classroomCoverage ? (
          <Stat
            label="Classrooms still needing help"
            value={`${
              classroomCoverage.partialRooms + classroomCoverage.emptyRooms
            } of ${classroomCoverage.rooms.length}`}
          />
        ) : (
          <Stat
            label="Recruiting goal"
            value={config.minSize ? `${config.minSize}` : "None set"}
          />
        )}
      </div>

      {config.grantsLinkedAccess && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Joining this committee also grants access to{" "}
          {detail.committee.scopeLabel}. That access is <strong>not</strong>{" "}
          automatically revoked when someone is removed from the roster.
        </p>
      )}

      <JoinQrSection
        committeeId={config.id}
        committeeName={config.name}
        joinCode={joinCode}
        joinUrl={joinUrl}
        qrDataUrl={qrDataUrl}
        isLive={config.status === "active" && !config.archivedAt}
      />

      {classroomCoverage && (
        <ClassroomCoverageTable
          committeeId={config.id}
          committeeName={config.name}
          coverage={classroomCoverage}
        />
      )}

      <RosterTable
        committeeId={config.id}
        committeeName={config.name}
        members={members}
        canPromoteToChair
        isCapped={config.capacityMode === "capped"}
        seatsRemaining={seatsRemaining}
        classroomOptions={
          classroomCoverage?.rooms.map((r) => r.classroom) ?? []
        }
        filledByClassroom={filledByClassroom}
        perClassroomLimit={config.perClassroomLimit}
      />

      {/* Per-classroom waitlists live inside each room's row above — one flat
          list ordered across every room would promote out of the wrong line. */}
      {!classroomCoverage && <WaitlistTable entries={waitlist} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
