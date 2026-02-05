import { auth } from "@/lib/auth";
import { EventPlanForm } from "@/components/event-plans/event-plan-form";

export default async function NewEventPlanPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Event Plan</h1>
        <p className="text-muted-foreground">
          Start planning a new PTA event
        </p>
      </div>
      <EventPlanForm mode="create" />
    </div>
  );
}
