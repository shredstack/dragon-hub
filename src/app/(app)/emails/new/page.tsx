import { auth } from "@/lib/auth";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { NewCampaignForm } from "@/components/emails/new-campaign-form";
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

  // Default the campaign to the current week, Monday through Friday.
  //
  // "Today" has to be resolved in the school's zone, not the server's: Vercel
  // runs in UTC, where a board member opening this on Sunday evening is already
  // into Monday and would get next week's dates.
  const timeZone = await getSchoolTimeZone(schoolId);
  const today = todayDateOnly(timeZone);
  // getUTCDay is safe here because the value is a bare calendar day.
  const dayOfWeek = new Date(`${today}T12:00:00Z`).getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = addDaysToDateOnly(today, -daysToMonday);
  const thisFriday = addDaysToDateOnly(thisMonday, 4);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Weekly Email</h1>
        <p className="text-muted-foreground">
          Create a new weekly email update for PTA members
        </p>
      </div>

      <NewCampaignForm
        defaultWeekStart={thisMonday}
        defaultWeekEnd={thisFriday}
      />
    </div>
  );
}
