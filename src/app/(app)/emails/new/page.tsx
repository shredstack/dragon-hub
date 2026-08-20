import { auth } from "@/lib/auth";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { NewCampaignForm } from "@/components/emails/new-campaign-form";
import { getCloneableCampaigns } from "@/actions/email-campaigns";
import { addDaysToDateOnly, todayDateOnly } from "@/lib/date-only";
import { getSchoolTimeZone } from "@/lib/school-time-zone";

export default async function NewEmailCampaignPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const isBoardMember = await isPtaBoard(userId);
  if (!isBoardMember) redirect("/dashboard");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  // Default to the **following** week, Monday through Friday.
  //
  // An email is written to tell families what is coming, so the week being
  // drafted on a Thursday is next week's — defaulting to the current week
  // meant retyping the dates every single time.
  //
  // "Today" has to be resolved in the school's zone, not the server's: Vercel
  // runs in UTC, where a board member opening this on Sunday evening is already
  // into Monday and would skip a week.
  const timeZone = await getSchoolTimeZone(schoolId);
  const today = todayDateOnly(timeZone);
  // getUTCDay is safe here because the value is a bare calendar day.
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  // On a Monday this is 7, not 0 — "next week" from Monday is the Monday
  // after, not today. On a Sunday it is 1, which is tomorrow, and that is the
  // week a Sunday-evening drafter means.
  const daysToNextMonday = (8 - dayOfWeek) % 7 || 7;
  const nextMonday = addDaysToDateOnly(today, daysToNextMonday);
  const nextFriday = addDaysToDateOnly(nextMonday, 4);

  const pastCampaigns = await getCloneableCampaigns();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Weekly Email</h1>
        <p className="text-muted-foreground">
          Create a new weekly email update for PTA members
        </p>
      </div>

      <NewCampaignForm
        defaultWeekStart={nextMonday}
        defaultWeekEnd={nextFriday}
        pastCampaigns={pastCampaigns.map((c) => ({
          id: c.id,
          title: c.title,
          weekStart: c.weekStart,
          weekEnd: c.weekEnd,
          status: c.status,
        }))}
      />
    </div>
  );
}
