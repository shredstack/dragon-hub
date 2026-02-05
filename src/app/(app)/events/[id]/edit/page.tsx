import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { assertEventPlanAccess } from "@/lib/auth-helpers";
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

  await assertEventPlanAccess(userId, id, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, id),
  });
  if (!plan) notFound();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit Event Plan</h1>
        <p className="text-muted-foreground">{plan.title}</p>
      </div>
      <EventPlanForm
        mode="edit"
        initialData={{
          id: plan.id,
          title: plan.title,
          description: plan.description,
          eventType: plan.eventType,
          eventDate: plan.eventDate?.toISOString() ?? null,
          location: plan.location,
          budget: plan.budget,
          schoolYear: plan.schoolYear,
        }}
      />
    </div>
  );
}
