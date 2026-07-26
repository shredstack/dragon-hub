import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { FeedbackThread } from "@/components/feedback/feedback-thread";
import {
  feedbackStatusClasses,
  feedbackStatusLabel,
  feedbackTypeClasses,
  feedbackTypeLabel,
} from "@/lib/feedback-shared";
import type { FeedbackStatus, FeedbackType } from "@/actions/feedback";
import { StatusControl } from "./status-control";

export default async function SuperAdminFeedbackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const item = await db.query.feedback.findFirst({
    where: eq(feedback.id, id),
    with: {
      submitter: { columns: { name: true, email: true } },
      school: { columns: { name: true } },
      resolver: { columns: { name: true, email: true } },
      messages: {
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      },
    },
  });

  if (!item) notFound();

  const submitterName =
    item.submitter?.name || item.submitter?.email || "Unknown";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/super-admin/feedback"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Feedback
      </Link>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${feedbackTypeClasses(
              item.type as FeedbackType
            )}`}
          >
            {feedbackTypeLabel(item.type as FeedbackType)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${feedbackStatusClasses(
              item.status as FeedbackStatus
            )}`}
          >
            {feedbackStatusLabel(item.status as FeedbackStatus)}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
          </span>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm">{item.body}</p>

        {item.screenshotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.screenshotUrl}
            alt="Screenshot attached to this feedback"
            className="mt-4 max-h-96 rounded-lg border border-border"
          />
        )}

        {/* Context */}
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Submitter</dt>
            <dd>
              {submitterName}
              {item.submitter?.email && item.submitter?.name && (
                <span className="text-muted-foreground">
                  {" "}
                  · {item.submitter.email}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">School</dt>
            <dd>{item.school?.name ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase text-muted-foreground">Page</dt>
            <dd className="break-words">
              {item.pageTitle ? `${item.pageTitle} — ` : ""}
              <span className="font-mono">{item.pageUrl}</span>
            </dd>
          </div>
          {item.dialogContext && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-muted-foreground">
                Open dialog
              </dt>
              <dd>{item.dialogContext}</dd>
            </div>
          )}
          {item.userAgent && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-muted-foreground">
                Browser
              </dt>
              <dd className="break-words text-xs text-muted-foreground">
                {item.userAgent}
              </dd>
            </div>
          )}
          {item.resolvedAt && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-muted-foreground">
                Completed
              </dt>
              <dd>
                {new Date(item.resolvedAt).toLocaleString()}
                {item.resolver?.name || item.resolver?.email
                  ? ` by ${item.resolver?.name || item.resolver?.email}`
                  : ""}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Status control */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Status</h2>
        <StatusControl
          feedbackId={item.id}
          current={item.status as FeedbackStatus}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Marking a ticket <strong>Completed</strong> emails the submitter so
          they can check it out.
        </p>
      </div>

      {/* Conversation */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Conversation</h2>
        <FeedbackThread
          feedbackId={item.id}
          as="admin"
          messages={item.messages.map((m) => ({
            id: m.id,
            fromAdmin: m.fromAdmin,
            body: m.body,
            createdAt: (m.createdAt ?? new Date()).toISOString(),
            authorName: submitterName,
          }))}
        />
      </div>
    </div>
  );
}
