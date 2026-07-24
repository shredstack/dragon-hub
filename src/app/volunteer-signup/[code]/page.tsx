import { getSignupPageData } from "@/actions/volunteer-signups";
import { getRoomParentAddonByQrCode } from "@/actions/volunteer-campaigns";
import {
  getRoomParentAddonCommitteesByQrCode,
  getPerClassroomCommitteesByQrCode,
} from "@/actions/committees";
import { getSignupSuccessHuntByQrCode } from "@/actions/scavenger-hunts";
import { notFound } from "next/navigation";
import { VolunteerSignupForm } from "./signup-form";
import {
  SignupPageHeader,
  SignupPageIntro,
} from "@/components/volunteer/signup-page-content";
import { MissionNote } from "@/components/volunteer/mission-note";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function VolunteerSignupPage({ params }: PageProps) {
  const { code } = await params;
  const data = await getSignupPageData(code);

  if (!data) {
    notFound();
  }

  // Optional add-on sections. Room parent recruitment stays the top of the page
  // — these render underneath it, and only when a board member has explicitly
  // opted a campaign or a committee into this page. The Back to School Night
  // goal is one QR code that captures all three in a single pass.
  const [addonCampaign, addonCommittees, perClassroomCommittees] =
    await Promise.all([
      getRoomParentAddonByQrCode(code),
      getRoomParentAddonCommitteesByQrCode(code),
      getPerClassroomCommitteesByQrCode(code),
    ]);

  // Only surfaced on the success screen, so it never competes with the form.
  const huntPromo = await getSignupSuccessHuntByQrCode(code);

  // Copy above the form is board-editable at /admin/room-parents/signup-page.
  const { content } = data;

  return (
    <div className="min-h-dvh bg-muted px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <SignupPageHeader content={content} />

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <SignupPageIntro content={content} />

          <VolunteerSignupForm
            qrCode={code}
            schoolName={data.school.name}
            classrooms={data.classrooms}
            partyTypes={data.partyTypes}
            roomParentWaitlistEnabled={data.roomParentWaitlistEnabled}
            addonCampaign={addonCampaign}
            addonCommittees={addonCommittees}
            perClassroomCommittees={perClassroomCommittees}
            eligibility={data.eligibility}
            huntPromo={huntPromo}
          />
        </div>

        <MissionNote />
      </div>
    </div>
  );
}
