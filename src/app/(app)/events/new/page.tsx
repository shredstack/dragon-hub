import { auth } from "@/lib/auth";
import { EventPlanForm } from "@/components/event-plans/event-plan-form";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";

export default async function NewEventPlanPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;
  const currentSchoolYear = await getSchoolCurrentYear(schoolId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Event Plan</h1>
        <p className="text-muted-foreground">
          Start planning a new PTA event
        </p>
      </div>
      <EventPlanForm mode="create" currentSchoolYear={currentSchoolYear} />
    </div>
  );
}
