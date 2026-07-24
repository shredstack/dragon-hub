import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  assertEventPlanWriteAccess,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getCatalogOptions } from "@/actions/event-catalog";
import { getSchoolTagOptions } from "@/lib/tag-options";
import { EventPlanForm } from "@/components/event-plans/event-plan-form";

interface EditEventPlanPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEventPlanPage({
  params,
}: EditEventPlanPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  await assertEventPlanWriteAccess(userId, id, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
  });
  if (!plan) notFound();

  const [currentSchoolYear, catalogOptions, availableTags, canCreateRecurring] =
    await Promise.all([
      plan.schoolId
        ? getSchoolCurrentYear(plan.schoolId)
        : Promise.resolve(plan.schoolYear),
      getCatalogOptions(),
      getSchoolTagOptions(plan.schoolId),
      plan.schoolId
        ? isPtaBoardMember(userId, plan.schoolId)
        : Promise.resolve(false),
    ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit Event Plan</h1>
        <p className="text-muted-foreground">{plan.title}</p>
      </div>
      <EventPlanForm
        mode="edit"
        currentSchoolYear={currentSchoolYear}
        catalogOptions={catalogOptions}
        canCreateRecurring={canCreateRecurring}
        availableTags={availableTags}
        initialData={{
          id: plan.id,
          title: plan.title,
          description: plan.description,
          eventType: plan.eventType,
          eventCatalogId: plan.eventCatalogId,
          isOneOff: plan.isOneOff,
          eventDate: plan.eventDate?.toISOString() ?? null,
          location: plan.location,
          budget: plan.budget,
          signupGeniusUrl: plan.signupGeniusUrl,
          tags: plan.tags,
          schoolYear: plan.schoolYear,
        }}
      />
    </div>
  );
}
