import { auth } from "@/lib/auth";
import { assertAuthenticated, getCurrentSchoolId, isSchoolPtaBoardOrAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { ptaMinutes } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MinutesStatusBadge } from "@/components/minutes/minutes-status-badge";
import { ApproveButton } from "@/components/minutes/approve-button";
import { SyncMinutesButton } from "@/components/minutes/sync-minutes-button";

export default async function MinutesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertAuthenticated();

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const isPtaBoard = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);

  // PTA Board sees all minutes, regular members only see approved
  const whereCondition = isPtaBoard
    ? eq(ptaMinutes.schoolId, schoolId)
    : and(eq(ptaMinutes.schoolId, schoolId), eq(ptaMinutes.status, "approved"));

  const minutes = await db.query.ptaMinutes.findMany({
    where: whereCondition,
    orderBy: [desc(ptaMinutes.meetingDate), desc(ptaMinutes.createdAt)],
    with: {
      approver: { columns: { name: true } },
    },
  });

  // Get latest approved for the highlight card
  const latestApproved = minutes.find((m) => m.status === "approved");

  // Split into pending and approved for PTA board view
  const pendingMinutes = minutes.filter((m) => m.status === "pending");
  const approvedMinutes = minutes.filter((m) => m.status === "approved");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">PTA Meeting Minutes</h1>
          <div className="mt-1 flex gap-4">
            <Link
              href="/minutes/agenda"
              className="text-sm text-primary hover:underline"
            >
              View Agendas →
            </Link>
          </div>
        </div>
        {isPtaBoard && <SyncMinutesButton />}
      </div>

      {/* Latest Approved Card */}
      {latestApproved && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Latest Minutes</h2>
          <Link
            href={`/minutes/${latestApproved.id}`}
            className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{latestApproved.fileName}</h3>
                  <MinutesStatusBadge status={latestApproved.status} />
                </div>
                {latestApproved.meetingDate && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Meeting Date:{" "}
                    {new Date(latestApproved.meetingDate).toLocaleDateString()}
                  </p>
                )}
                {latestApproved.aiSummary && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {latestApproved.aiSummary}
                  </p>
                )}
              </div>
              <a
                href={latestApproved.googleDriveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Open in Drive
              </a>
            </div>
          </Link>
        </section>
      )}

      {/* Pending Minutes (PTA Board only) */}
      {isPtaBoard && pendingMinutes.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Pending Approval</h2>
          <div className="rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">File Name</th>
                    <th className="p-3">Meeting Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingMinutes.map((m) => (
                    <tr key={m.id} className="border-b border-border">
                      <td className="p-3">
                        <Link
                          href={`/minutes/${m.id}`}
                          className="font-medium hover:underline"
                        >
                          {m.fileName}
                        </Link>
                      </td>
                      <td className="p-3">
                        {m.meetingDate
                          ? new Date(m.meetingDate).toLocaleDateString()
                          : "Not set"}
                      </td>
                      <td className="p-3">
                        <MinutesStatusBadge status={m.status} />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <ApproveButton minutesId={m.id} />
                          <a
                            href={m.googleDriveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            View
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* All Approved Minutes */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {isPtaBoard ? "All Approved Minutes" : "Meeting Minutes Archive"}
        </h2>
        {approvedMinutes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center">
            <p className="text-muted-foreground">
              No approved minutes available yet.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">File Name</th>
                    <th className="p-3">Meeting Date</th>
                    <th className="p-3">School Year</th>
                    <th className="p-3">Summary</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedMinutes.map((m) => (
                    <tr key={m.id} className="border-b border-border">
                      <td className="p-3">
                        <Link
                          href={`/minutes/${m.id}`}
                          className="font-medium hover:underline"
                        >
                          {m.fileName}
                        </Link>
                      </td>
                      <td className="p-3">
                        {m.meetingDate
                          ? new Date(m.meetingDate).toLocaleDateString()
                          : "Not set"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{m.schoolYear}</Badge>
                      </td>
                      <td className="max-w-xs truncate p-3 text-muted-foreground">
                        {m.aiSummary || "No summary"}
                      </td>
                      <td className="p-3">
                        <a
                          href={m.googleDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Open in Drive
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
