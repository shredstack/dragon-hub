import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { getCommitteeAdminDetail } from "@/actions/committees";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { CommitteeActions } from "./committee-actions";
import { JoinQrSection } from "./join-qr-section";
import { RosterTable } from "./roster-table";
import { WaitlistTable } from "./waitlist-table";

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

  let detail;
  try {
    detail = await getCommitteeAdminDetail(id);
  } catch {
    notFound();
  }

  const { config, members, waitlist, joinCode, joinUrl, qrDataUrl } = detail;

  const seatsRemaining =
    config.capacityMode === "capped" && config.maxSize !== null
      ? Math.max(0, config.maxSize - members.length)
      : null;
  const stillNeeded = config.minSize
    ? Math.max(0, config.minSize - members.length)
    : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/committees"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All committees
      </Link>

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
        <Stat
          label="Recruiting goal"
          value={config.minSize ? `${config.minSize}` : "None set"}
        />
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

      <RosterTable
        committeeId={config.id}
        committeeName={config.name}
        members={members}
        canPromoteToChair
        isCapped={config.capacityMode === "capped"}
        seatsRemaining={seatsRemaining}
      />

      <WaitlistTable entries={waitlist} />
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
