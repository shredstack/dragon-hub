import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { FeedbackList, type FeedbackRow } from "./feedback-list";

export const metadata = {
  title: "Feedback",
};

export default async function SuperAdminFeedbackPage() {
  const rows = await db.query.feedback.findMany({
    orderBy: [desc(feedback.createdAt)],
    with: {
      submitter: { columns: { name: true, email: true } },
      school: { columns: { name: true } },
      messages: { columns: { id: true } },
    },
  });

  const items: FeedbackRow[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    body: r.body,
    pageUrl: r.pageUrl,
    createdAt: (r.createdAt ?? new Date()).toISOString(),
    submitterName: r.submitter?.name ?? null,
    submitterEmail: r.submitter?.email ?? null,
    schoolName: r.school?.name ?? null,
    messageCount: r.messages.length,
    hasScreenshot: !!r.screenshotUrl,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Feedback</h1>
        <p className="text-muted-foreground">
          Bugs and improvements submitted across all schools
        </p>
      </div>
      <FeedbackList items={items} />
    </div>
  );
}
