import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { tags, ptaMinutes } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { TagManagementClient } from "./tag-management-client";
import { BackfillButton } from "./backfill-button";

export default async function AdminTagsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [allTags, minutesNeedingAnalysis] = await Promise.all([
    db.query.tags.findMany({
      where: eq(tags.schoolId, schoolId),
      orderBy: [desc(tags.usageCount)],
    }),
    db.query.ptaMinutes.findMany({
      where: eq(ptaMinutes.schoolId, schoolId),
      columns: { id: true, aiKeyItems: true, textContent: true },
    }),
  ]);

  // Count minutes that need analysis (have content but no rich analysis)
  const needsAnalysisCount = minutesNeedingAnalysis.filter(
    (m) => m.textContent && !m.aiKeyItems
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manage Tags</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage and consolidate tags used across minutes, knowledge articles,
          and event plans. Tags help organize and filter content by topic.
        </p>
      </div>

      {/* Backfill Section */}
      {needsAnalysisCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                Minutes Need Analysis
              </h3>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                {needsAnalysisCount} minutes have content but haven&apos;t been
                analyzed yet. Run the backfill to generate AI summaries and
                tags.
              </p>
            </div>
            <BackfillButton count={needsAnalysisCount} />
          </div>
        </div>
      )}

      {/* Tag Management */}
      <TagManagementClient tags={allTags} />
    </div>
  );
}
