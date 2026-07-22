import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { EventPlanForm } from "@/components/event-plans/event-plan-form";
import {
  getCurrentSchoolId,
  isSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getCatalogOptions } from "@/actions/event-catalog";
import { getSchoolTagOptions } from "@/lib/tag-options";

export default async function NewEventPlanPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Creating a plan is a board action — mirrors the check in createEventPlan
  // so the form is never offered to someone whose submit would be rejected.
  const isBoardOrAdmin = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);
  if (!isBoardOrAdmin) notFound();

  const [currentSchoolYear, catalogOptions, availableTags] = await Promise.all([
    getSchoolCurrentYear(schoolId),
    getCatalogOptions(),
    getSchoolTagOptions(schoolId),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Event Plan</h1>
        <p className="text-muted-foreground">
          Start planning a new PTA event
        </p>
      </div>
      <EventPlanForm
        mode="create"
        currentSchoolYear={currentSchoolYear}
        catalogOptions={catalogOptions}
        canCreateRecurring={isBoardOrAdmin}
        availableTags={availableTags}
      />
    </div>
  );
}
