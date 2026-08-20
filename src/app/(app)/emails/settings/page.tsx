import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailRecurringSections, schools } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { RecurringSectionsList } from "@/components/emails/recurring-sections-list";
import { EmailFooterEditor } from "@/components/emails/email-footer-editor";
import { Settings } from "lucide-react";
import { parseImagePosition } from "@/lib/email/image-position";
import { parseImageWidth } from "@/lib/email/image-width";
import { listMissingDefaultRecurringSections } from "@/actions/email-recurring";
import { ensureBoardSignoffSection } from "@/lib/email/recurring-defaults";
import {
  DEFAULT_EMAIL_FOOTER_HTML,
  EMAIL_FOOTER_KEY,
} from "@/lib/email/footer";
import { getBoardRosterHtml } from "@/lib/email/board-roster";

export default async function EmailSettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const isBoardMember = await isPtaBoard(userId);
  if (!isBoardMember) redirect("/dashboard");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  // Lazy backfill on a read path, the same shape as `getBoardPositionsWithSeed()`
  // — the secretary opening this page to write her footer should find one to
  // edit, not an empty state asking her to add standard sections first.
  await ensureBoardSignoffSection(schoolId);

  const [allSections, school, rosterHtml, missingDefaults] = await Promise.all([
    db.query.emailRecurringSections.findMany({
      where: eq(emailRecurringSections.schoolId, schoolId),
      orderBy: [asc(emailRecurringSections.defaultSortOrder)],
    }),
    db.query.schools.findFirst({
      where: eq(schools.id, schoolId),
      columns: { name: true, currentSchoolYear: true },
    }),
    getBoardRosterHtml(schoolId),
    listMissingDefaultRecurringSections(),
  ]);

  // The footer has its own editor above; showing it a second time in the list
  // below would give the same block two places to be edited and one of them
  // would win silently.
  const footer = allSections.find((s) => s.key === EMAIL_FOOTER_KEY);
  const recurringSections = allSections.filter(
    (s) => s.key !== EMAIL_FOOTER_KEY
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Email Settings</h1>
        <p className="text-muted-foreground">
          The footer and the other blocks that go on every weekly email
        </p>
      </div>

      <EmailFooterEditor
        title={footer?.title ?? ""}
        bodyTemplate={footer?.bodyTemplate ?? DEFAULT_EMAIL_FOOTER_HTML}
        active={footer?.active ?? true}
        schoolName={school?.name || "School"}
        schoolYear={school?.currentSchoolYear ?? null}
        rosterHtml={rosterHtml}
      />

      {recurringSections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <Settings className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">
            No other recurring sections
          </h2>
          <p className="mb-4 max-w-md text-center text-sm text-muted-foreground">
            Recurring sections like &quot;Join PTA&quot;, &quot;Volunteer
            Opportunities&quot;, and &quot;Yearbook&quot; can be added to every
            email automatically.
          </p>
          <RecurringSectionsList sections={[]} showSeedButton />
        </div>
      ) : (
        <RecurringSectionsList
          missingDefaults={missingDefaults}
          sections={recurringSections.map((s) => ({
            id: s.id,
            key: s.key,
            title: s.title,
            bodyTemplate: s.bodyTemplate,
            linkUrl: s.linkUrl,
            linkText: s.linkText,
            imageUrl: s.imageUrl,
            imagePosition: parseImagePosition(s.imagePosition),
            imageWidth: parseImageWidth(s.imageWidth),
            audience: s.audience,
            positionType: s.positionType,
            positionIndex: s.positionIndex,
            defaultSortOrder: s.defaultSortOrder,
            active: s.active ?? true,
          }))}
        />
      )}
    </div>
  );
}
