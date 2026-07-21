import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getCampaigns } from "@/actions/volunteer-campaigns";
import { CampaignList } from "./campaign-list";

export default async function VolunteerCampaignsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const campaigns = await getCampaigns();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Volunteer Campaigns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The digital version of the volunteer flyer that goes home with
          students. Build a list of events, print the QR code, and see who&apos;s
          interested — no commitment required from parents.
        </p>
      </div>

      <CampaignList campaigns={campaigns} />
    </div>
  );
}
