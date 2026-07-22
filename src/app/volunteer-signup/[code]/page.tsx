import { getSignupPageData } from "@/actions/volunteer-signups";
import { getRoomParentAddonByQrCode } from "@/actions/volunteer-campaigns";
import { notFound } from "next/navigation";
import { VolunteerSignupForm } from "./signup-form";
import {
  SignupPageHeader,
  SignupPageIntro,
} from "@/components/volunteer/signup-page-content";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function VolunteerSignupPage({ params }: PageProps) {
  const { code } = await params;
  const data = await getSignupPageData(code);

  if (!data) {
    notFound();
  }

  // Optional general-PTA event section. Room parent recruitment stays the top
  // of the page — this renders underneath it, and only when a board member has
  // explicitly opted a campaign into this page.
  const addonCampaign = await getRoomParentAddonByQrCode(code);

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
            roomParentLimit={data.roomParentLimit}
            addonCampaign={addonCampaign}
          />
        </div>
      </div>
    </div>
  );
}
