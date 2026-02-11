import { auth } from "@/lib/auth";
import { assertSchoolPtaBoardOrAdmin, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { eventCatalog, eventPlans } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { EventCatalogAdmin } from "./event-catalog-admin";

export default async function EventCatalogAdminPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  await assertSchoolPtaBoardOrAdmin(session.user.id, schoolId);

  // Get all catalog entries
  const entries = await db.query.eventCatalog.findMany({
    where: eq(eventCatalog.schoolId, schoolId),
    orderBy: [desc(eventCatalog.createdAt)],
  });

  // Count completed event plans that could be used to generate catalog entries
  const completedPlans = await db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.status, "completed")
    ),
    columns: { id: true, title: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Event Catalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the catalog of events that board members can browse and express interest in.
          These entries help new board members understand what events the PTA runs and volunteer to lead them.
        </p>
      </div>

      <EventCatalogAdmin
        entries={entries}
        completedEventPlansCount={completedPlans.length}
      />
    </div>
  );
}
