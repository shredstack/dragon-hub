import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  emailCampaigns,
  emailSections,
  emailContentItems,
  emailContentImages,
  schools,
} from "@/lib/db/schema";
import { eq, and, asc, desc, gte, lte } from "drizzle-orm";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect, notFound } from "next/navigation";
import { EmailEditor } from "@/components/emails/email-editor";
import { parseImagePosition } from "@/lib/email/image-position";

interface EmailEditorPageProps {
  params: Promise<{ id: string }>;
}

export default async function EmailEditorPage({ params }: EmailEditorPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const isBoardMember = await isPtaBoard(userId);
  if (!isBoardMember) redirect("/dashboard");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  // Fetch campaign with sections
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, id),
      eq(emailCampaigns.schoolId, schoolId)
    ),
    with: {
      sections: {
        orderBy: [asc(emailSections.sortOrder)],
      },
    },
  });

  if (!campaign) notFound();

  // Fetch school info
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  // The submissions relevant to *this* week, not every open one. They were
  // added to the email automatically at creation; the panel is there so the
  // secretary can see what arrived and put back anything she removed.
  const pendingContentItems = await db.query.emailContentItems.findMany({
    where: and(
      eq(emailContentItems.schoolId, schoolId),
      eq(emailContentItems.status, "pending"),
      lte(emailContentItems.startDate, campaign.weekEnd),
      gte(emailContentItems.endDate, campaign.weekStart)
    ),
    with: {
      images: {
        orderBy: [asc(emailContentImages.sortOrder)],
      },
      submitter: true,
    },
    orderBy: [desc(emailContentItems.createdAt)],
  });

  return (
    <EmailEditor
      campaign={{
        id: campaign.id,
        title: campaign.title,
        weekStart: campaign.weekStart,
        weekEnd: campaign.weekEnd,
        status: campaign.status,
        ptaHtml: campaign.ptaHtml,
        schoolHtml: campaign.schoolHtml,
        headerHtml: campaign.headerHtml,
        headerImageUrl: campaign.headerImageUrl,
        headerImageAlt: campaign.headerImageAlt,
      }}
      sections={campaign.sections.map((s) => ({
        id: s.id,
        title: s.title,
        body: s.body,
        linkUrl: s.linkUrl,
        linkText: s.linkText,
        imageUrl: s.imageUrl,
        imageAlt: s.imageAlt,
        imageLinkUrl: s.imageLinkUrl,
        imagePosition: parseImagePosition(s.imagePosition),
        sectionType: s.sectionType,
        recurringKey: s.recurringKey,
        audience: s.audience,
        sortOrder: s.sortOrder,
      }))}
      pendingContentItems={pendingContentItems.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        linkUrl: item.linkUrl,
        linkText: item.linkText,
        audience: item.audience,
        startDate: item.startDate,
        endDate: item.endDate,
        submitterName: item.submitter?.name || null,
        images: item.images.map((img) => ({
          id: img.id,
          blobUrl: img.blobUrl,
          fileName: img.fileName,
        })),
      }))}
      schoolName={school?.name || "School"}
    />
  );
}
