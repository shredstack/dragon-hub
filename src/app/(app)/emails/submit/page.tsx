import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailContentItems, emailContentImages, users } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { ContentSubmitForm } from "@/components/emails/content-submit-form";
import { ContentItemCard } from "@/components/emails/content-item-card";
import { FileText } from "lucide-react";

export default async function EmailSubmitPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const isBoardMember = await isPtaBoard(userId);
  if (!isBoardMember) redirect("/dashboard");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  // Fetch user's submitted content items
  const myItems = await db.query.emailContentItems.findMany({
    where: and(
      eq(emailContentItems.schoolId, schoolId),
      eq(emailContentItems.submittedBy, userId)
    ),
    with: {
      images: {
        orderBy: [emailContentImages.sortOrder],
      },
    },
    orderBy: [desc(emailContentItems.createdAt)],
  });

  // Fetch all pending items (for inbox view)
  const pendingItems = await db.query.emailContentItems.findMany({
    where: and(
      eq(emailContentItems.schoolId, schoolId),
      eq(emailContentItems.status, "pending")
    ),
    with: {
      images: {
        orderBy: [emailContentImages.sortOrder],
      },
      submitter: true,
    },
    orderBy: [desc(emailContentItems.createdAt)],
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Submit Email Content</h1>
        <p className="text-muted-foreground">
          Submit announcements, events, or news for the weekly PTA email
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-lg font-semibold">New Submission</h2>
          <ContentSubmitForm />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold">
            Pending Items ({pendingItems.length})
          </h2>
          {pendingItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-12">
              <FileText className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending content items
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingItems.map((item) => (
                <ContentItemCard
                  key={item.id}
                  item={{
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    linkUrl: item.linkUrl,
                    linkText: item.linkText,
                    audience: item.audience,
                    targetDate: item.targetDate,
                    status: item.status,
                    submitterName: item.submitter?.name || null,
                    createdAt: item.createdAt?.toISOString() || null,
                    images: item.images.map((img) => ({
                      id: img.id,
                      blobUrl: img.blobUrl,
                      fileName: img.fileName,
                    })),
                  }}
                  showActions={item.submittedBy === userId}
                />
              ))}
            </div>
          )}

          {myItems.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-4 text-lg font-semibold">
                My Submissions ({myItems.length})
              </h2>
              <div className="space-y-4">
                {myItems.map((item) => (
                  <ContentItemCard
                    key={item.id}
                    item={{
                      id: item.id,
                      title: item.title,
                      description: item.description,
                      linkUrl: item.linkUrl,
                      linkText: item.linkText,
                      audience: item.audience,
                      targetDate: item.targetDate,
                      status: item.status,
                      submitterName: null,
                      createdAt: item.createdAt?.toISOString() || null,
                      images: item.images.map((img) => ({
                        id: img.id,
                        blobUrl: img.blobUrl,
                        fileName: img.fileName,
                      })),
                    }}
                    showActions={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
