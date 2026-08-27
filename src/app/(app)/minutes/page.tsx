import { auth } from "@/lib/auth";
import { assertAuthenticated, getCurrentSchoolId, isPtaBoardMember } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { ptaMinutes, tags as tagsTable } from "@/lib/db/schema";
import { eq, and, isNull, desc, asc, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MinutesStatusBadge } from "@/components/minutes/minutes-status-badge";
import { ExpandableSummary } from "@/components/minutes/expandable-summary";
import { SyncMinutesButton } from "@/components/minutes/sync-minutes-button";
import { MinutesListClient } from "./minutes-list-client";
import { PendingMinutesTable } from "./pending-minutes-table";
import { formatShortDateOnly } from "@/lib/date-only";

export const metadata = { title: "Minutes" };

// The Sync Minutes button's server action (triggerMinutesSync) runs a Drive
// listing, AI analysis for any new files, and an OpenAI embedding backfill
// for every minutes row still missing one — see syncSchoolMinutes. Without
// this the action inherits the platform default (10s), which a multi-file
// sync easily outruns, surfacing as a plain "Failed to sync minutes" with no
// indication it was a timeout. Mirrors the same fix on the guide page.
export const maxDuration = 300;

export default async function MinutesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertAuthenticated();

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const isPtaBoard = await isPtaBoardMember(session.user.id, schoolId);

  // PTA Board sees all minutes, regular members only see approved. Archived
  // records stay out of both views but remain in the database.
  const whereCondition = isPtaBoard
    ? and(eq(ptaMinutes.schoolId, schoolId), isNull(ptaMinutes.archivedAt))
    : and(
        eq(ptaMinutes.schoolId, schoolId),
        eq(ptaMinutes.status, "approved"),
        isNull(ptaMinutes.archivedAt)
      );

  const [minutes, tags] = await Promise.all([
    db.query.ptaMinutes.findMany({
      where: whereCondition,
      // NULLS LAST, because Postgres sorts nulls *first* on a DESC — which put
      // every document whose meeting date couldn't be parsed above the newest
      // real minutes, and made "Latest Approved" pick one of them.
      orderBy: [
        sql`${ptaMinutes.meetingDate} desc nulls last`,
        desc(ptaMinutes.createdAt),
      ],
      with: {
        approver: { columns: { name: true } },
      },
    }),
    db.query.tags.findMany({
      where: eq(tagsTable.schoolId, schoolId),
      orderBy: [desc(tagsTable.usageCount), asc(tagsTable.displayName)],
    }),
  ]);

  // Get latest approved for the highlight card
  const latestApproved = minutes.find((m) => m.status === "approved");

  // Split into pending and approved for PTA board view. Pending minutes are
  // ordered most-recently-added first so newly synced docs awaiting approval
  // surface to the top.
  const pendingMinutes = minutes
    .filter((m) => m.status === "pending")
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  const approvedMinutes = minutes.filter((m) => m.status === "approved");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">PTA Meeting Minutes</h1>
          {/* Agendas are board-only: they are working drafts of a meeting that
              hasn't happened yet, not a published record. */}
          {isPtaBoard && (
            <div className="mt-1 flex gap-4">
              <Link
                href="/minutes/agenda"
                className="text-sm text-primary hover:underline"
              >
                View Agendas →
              </Link>
              <Link
                href="/admin/tags"
                className="text-sm text-muted-foreground hover:underline"
              >
                Manage Tags
              </Link>
            </div>
          )}
        </div>
        {isPtaBoard && <SyncMinutesButton />}
      </div>

      {/* Latest Approved Card */}
      {latestApproved && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Latest Approved</h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/minutes/${latestApproved.id}`}
                    className="font-medium hover:underline"
                  >
                    {latestApproved.fileName}
                  </Link>
                  <Badge variant={latestApproved.documentType === "agenda" ? "secondary" : "outline"}>
                    {latestApproved.documentType === "agenda" ? "Agenda" : "Minutes"}
                  </Badge>
                  <MinutesStatusBadge status={latestApproved.status} />
                </div>
                {latestApproved.meetingDate && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Meeting Date:{" "}
                    {formatShortDateOnly(latestApproved.meetingDate)}
                  </p>
                )}
                {latestApproved.aiSummary && (
                  <div className="mt-2">
                    <ExpandableSummary
                      summary={latestApproved.aiSummary}
                      clampLines={2}
                      className="text-sm"
                    />
                  </div>
                )}
                {latestApproved.tags && latestApproved.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {latestApproved.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <a
                href={latestApproved.googleDriveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm text-primary hover:underline"
              >
                Open in Drive
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Pending Minutes (PTA Board only) */}
      {isPtaBoard && pendingMinutes.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Pending Approval</h2>
          <PendingMinutesTable
            minutes={pendingMinutes.map((m) => ({
              id: m.id,
              fileName: m.fileName,
              documentType: m.documentType,
              meetingDate: m.meetingDate,
              aiSummary: m.aiSummary,
              tags: m.tags,
              status: m.status,
              googleDriveUrl: m.googleDriveUrl,
            }))}
          />
        </section>
      )}

      {/* All Approved Minutes with Tag Filtering */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {isPtaBoard ? "All Approved" : "Minutes & Agendas Archive"}
        </h2>
        {approvedMinutes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center">
            <p className="text-muted-foreground">
              No approved documents available yet.
            </p>
          </div>
        ) : (
          <MinutesListClient
            minutes={approvedMinutes}
            tags={tags}
            isPtaBoard={isPtaBoard}
          />
        )}
      </section>
    </div>
  );
}
