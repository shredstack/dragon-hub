import { auth } from "@/lib/auth";
import { isPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { NewCampaignForm } from "@/components/emails/new-campaign-form";

export default async function NewEmailCampaignPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/sign-in");

  const isBoardMember = await isPtaBoard(userId);
  if (!isBoardMember) redirect("/dashboard");

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) redirect("/join-school");

  // Calculate default week dates (current week's Monday to Friday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  // Days to subtract to get to Monday (Sunday = 6 days back, Monday = 0, Tuesday = 1, etc.)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysToMonday);

  const thisFriday = new Date(thisMonday);
  thisFriday.setDate(thisMonday.getDate() + 4);

  const formatDate = (date: Date) => date.toISOString().split("T")[0];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Weekly Email</h1>
        <p className="text-muted-foreground">
          Create a new weekly email update for PTA members
        </p>
      </div>

      <NewCampaignForm
        defaultWeekStart={formatDate(thisMonday)}
        defaultWeekEnd={formatDate(thisFriday)}
      />
    </div>
  );
}
