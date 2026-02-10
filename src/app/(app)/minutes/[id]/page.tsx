import { auth } from "@/lib/auth";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  isSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { ptaMinutes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MinutesStatusBadge } from "@/components/minutes/minutes-status-badge";
import { ApproveButton } from "@/components/minutes/approve-button";
import { DeleteMinutesButton } from "@/components/minutes/delete-minutes-button";
import { RichSummary } from "@/components/minutes/rich-summary";
import { RegenerateSummaryButton } from "./regenerate-summary-button";
import { Calendar, AlertCircle } from "lucide-react";

interface MinutesDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MinutesDetailPage({
  params,
}: MinutesDetailPageProps) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) return null;
  await assertAuthenticated();

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const isPtaBoard = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);

  const minutes = await db.query.ptaMinutes.findFirst({
    where: and(eq(ptaMinutes.id, id), eq(ptaMinutes.schoolId, schoolId)),
    with: {
      approver: { columns: { name: true, email: true } },
    },
  });

  if (!minutes) {
    notFound();
  }

  // Non-board members can only see approved minutes
  if (!isPtaBoard && minutes.status !== "approved") {
    notFound();
  }

  // Check if we have rich analysis or just basic summary
  const hasRichAnalysis =
    (minutes.aiKeyItems && minutes.aiKeyItems.length > 0) ||
    (minutes.aiActionItems && minutes.aiActionItems.length > 0) ||
    (minutes.aiImprovements && minutes.aiImprovements.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/minutes"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Minutes
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{minutes.fileName}</h1>
            <Badge variant={minutes.documentType === "agenda" ? "secondary" : "outline"}>
              {minutes.documentType === "agenda" ? "Agenda" : "Minutes"}
            </Badge>
            <MinutesStatusBadge status={minutes.status} />
          </div>
          {minutes.meetingDate && (
            <p className="mt-1 flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(minutes.meetingDate).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {minutes.dateConfidence && minutes.dateConfidence !== "high" && (
                <span className="text-xs text-amber-600" title="Date extracted with less than high confidence">
                  (AI extracted)
                </span>
              )}
            </p>
          )}
          {minutes.aiExtractedDate && !minutes.meetingDate && (
            <p className="mt-1 flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="italic">
                AI detected date:{" "}
                {new Date(minutes.aiExtractedDate).toLocaleDateString()}
              </span>
              <Badge variant="outline" className="text-xs">
                {minutes.dateConfidence || "low"} confidence
              </Badge>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPtaBoard && minutes.status === "pending" && (
            <ApproveButton minutesId={minutes.id} />
          )}
          <a
            href={minutes.googleDriveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            Open in Google Drive
          </a>
          {isPtaBoard && (
            <DeleteMinutesButton
              minutesId={minutes.id}
              fileName={minutes.fileName}
            />
          )}
        </div>
      </div>

      {/* Tags */}
      {minutes.tags && minutes.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {minutes.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">School Year</p>
          <p className="mt-1 font-medium">{minutes.schoolYear}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Last Synced</p>
          <p className="mt-1 font-medium">
            {minutes.lastSyncedAt
              ? new Date(minutes.lastSyncedAt).toLocaleString()
              : "Never"}
          </p>
        </div>
        {minutes.status === "approved" && minutes.approver && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Approved By</p>
            <p className="mt-1 font-medium">{minutes.approver.name}</p>
          </div>
        )}
        {minutes.approvedAt && (
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Approved At</p>
            <p className="mt-1 font-medium">
              {new Date(minutes.approvedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* AI Summary */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">AI Analysis</h2>
          {isPtaBoard && <RegenerateSummaryButton minutesId={minutes.id} />}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          {hasRichAnalysis ? (
            <RichSummary
              summary={minutes.aiSummary}
              keyItems={minutes.aiKeyItems}
              actionItems={minutes.aiActionItems}
              improvements={minutes.aiImprovements}
            />
          ) : minutes.aiSummary ? (
            <div>
              <p className="whitespace-pre-wrap">{minutes.aiSummary}</p>
              {isPtaBoard && (
                <div className="mt-4 flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p>
                    This is a basic summary. Click &quot;Regenerate Analysis&quot; to get
                    a richer analysis with key items, action items, and
                    suggestions.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <RichSummary
              summary={null}
              keyItems={null}
              actionItems={null}
              improvements={null}
            />
          )}
        </div>
      </section>

      {/* Text Content Preview */}
      {isPtaBoard && minutes.textContent && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Content Preview</h2>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-card p-4">
            <pre className="whitespace-pre-wrap text-sm">
              {minutes.textContent.slice(0, 5000)}
              {minutes.textContent.length > 5000 && "\n\n[Content truncated...]"}
            </pre>
          </div>
        </section>
      )}

      {/* Actions for PTA Board */}
      {isPtaBoard && minutes.status === "approved" && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/knowledge/from-minutes/${minutes.id}`}
              className="inline-flex h-9 items-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted hover:text-foreground"
            >
              Extract Knowledge Articles
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
