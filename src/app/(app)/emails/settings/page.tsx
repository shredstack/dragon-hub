import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailRecurringSections } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { RecurringSectionsList } from "@/components/emails/recurring-sections-list";
import { Settings } from "lucide-react";

export default async function EmailSettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const isBoardMember = await isPtaBoard(userId);
  if (!isBoardMember) redirect("/dashboard");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  // Fetch recurring sections
  const recurringSections = await db.query.emailRecurringSections.findMany({
    where: eq(emailRecurringSections.schoolId, schoolId),
    orderBy: [asc(emailRecurringSections.defaultSortOrder)],
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Email Settings</h1>
        <p className="text-muted-foreground">
          Manage recurring sections that appear in weekly emails
        </p>
      </div>

      {recurringSections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <Settings className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">
            No recurring sections configured
          </h2>
          <p className="mb-4 text-center text-sm text-muted-foreground max-w-md">
            Recurring sections like &quot;Join PTA&quot;, &quot;Volunteer
            Opportunities&quot;, and &quot;Yearbook&quot; can be added to every
            email automatically.
          </p>
          <RecurringSectionsList sections={[]} showSeedButton />
        </div>
      ) : (
        <RecurringSectionsList
          sections={recurringSections.map((s) => ({
            id: s.id,
            key: s.key,
            title: s.title,
            bodyTemplate: s.bodyTemplate,
            linkUrl: s.linkUrl,
            linkText: s.linkText,
            imageUrl: s.imageUrl,
            audience: s.audience,
            defaultSortOrder: s.defaultSortOrder,
            active: s.active ?? true,
          }))}
        />
      )}
    </div>
  );
}
