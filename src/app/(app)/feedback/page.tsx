import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMyFeedback } from "@/actions/feedback";
import { FeedbackThread } from "@/components/feedback/feedback-thread";
import {
  feedbackStatusClasses,
  feedbackStatusLabel,
  feedbackTypeClasses,
  feedbackTypeLabel,
} from "@/lib/feedback-shared";
import type { FeedbackStatus, FeedbackType } from "@/actions/feedback";

export const metadata = {
  title: "My Feedback",
};

export default async function MyFeedbackPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const items = await getMyFeedback();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Bugs and improvements you&apos;ve sent us, and any conversation about
          them. Use the feedback button on any page to send more.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          You haven&apos;t sent any feedback yet.
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-card p-4"
            >
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
                  {item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString()
                    : ""}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm">{item.body}</p>

              {item.pageUrl && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sent from{" "}
                  <span className="font-mono">{item.pageUrl}</span>
                </p>
              )}

              {item.screenshotUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.screenshotUrl}
                  alt="Screenshot attached to this feedback"
                  className="mt-3 max-h-64 rounded-lg border border-border"
                />
              )}

              <div className="mt-4 border-t border-border pt-4">
                <FeedbackThread
                  feedbackId={item.id}
                  as="user"
                  collapsible={item.messages.length > 0}
                  messages={item.messages.map((m) => ({
                    id: m.id,
                    fromAdmin: m.fromAdmin,
                    body: m.body,
                    createdAt: (m.createdAt ?? new Date()).toISOString(),
                    authorName: null,
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
