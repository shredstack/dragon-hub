import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { getVolunteerEligibility } from "@/actions/volunteer-signups";
import { EligibilityEditor } from "./eligibility-editor";

export default async function VolunteerEligibilityPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const { eligibility } = await getVolunteerEligibility();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Volunteer Eligibility Reminder</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Most districts require volunteers to renew a volunteer application
          once every school year before they can help at the school. Point this
          at your district&apos;s site and every new volunteer gets the reminder
          the moment they sign up — on the confirmation screen and in their
          welcome email.
        </p>
      </div>

      <EligibilityEditor initialEligibility={eligibility} />
    </div>
  );
}
