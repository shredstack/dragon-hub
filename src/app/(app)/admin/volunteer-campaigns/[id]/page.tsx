import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import {
  getCampaignDetail,
  getCampaignRoster,
} from "@/actions/volunteer-campaigns";
import { CampaignSettings } from "./campaign-settings";
import { CampaignQrSection } from "./campaign-qr-section";
import { EventEditor } from "./event-editor";
import { InterestRoster } from "./interest-roster";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const { id } = await params;

  let detail;
  try {
    detail = await getCampaignDetail(id);
  } catch {
    notFound();
  }

  const roster = await getCampaignRoster(id);
  const { campaign, signupUrl, qrDataUrl, eventPlans, catalogEntries } = detail;
  const totalInterested = roster.reduce((sum, e) => sum + e.volunteers.length, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{campaign.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {campaign.schoolYear} · {campaign.events.length} event
          {campaign.events.length === 1 ? "" : "s"} · {totalInterested} interested
        </p>
      </div>

      <CampaignSettings campaign={campaign} />

      <EventEditor
        campaignId={campaign.id}
        events={campaign.events}
        eventPlans={eventPlans}
        catalogEntries={catalogEntries}
      />

      <CampaignQrSection
        campaignId={campaign.id}
        campaignTitle={campaign.title}
        qrCode={campaign.qrCode}
        qrDataUrl={qrDataUrl}
        signupUrl={signupUrl}
        status={campaign.status}
        eventCount={campaign.events.length}
      />

      <InterestRoster campaignId={campaign.id} roster={roster} />
    </div>
  );
}
