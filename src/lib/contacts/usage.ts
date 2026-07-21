import { db } from "@/lib/db";
import {
  eventContactLinks,
  eventPlans,
  schoolContacts,
} from "@/lib/db/schema";
import { eq, inArray, or } from "drizzle-orm";

/**
 * Stamp every contact used by a plan with its school year.
 *
 * Called when a plan completes, so the directory can show "last used 2025-2026"
 * and a vendor nobody has called in three years is visible as such.
 *
 * Deliberately a plain library function rather than a server action: it takes an
 * arbitrary plan id and writes across the contact directory, and every export of
 * a `"use server"` module is a callable endpoint. The caller
 * (`completeEventPlan`) has already proven the user leads this plan.
 */
export async function stampContactUsage(
  eventPlanId: string,
  schoolYear: string
) {
  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
    columns: { eventCatalogId: true },
  });

  const targets = [eq(eventContactLinks.eventPlanId, eventPlanId)];
  if (plan?.eventCatalogId) {
    targets.push(eq(eventContactLinks.eventCatalogId, plan.eventCatalogId));
  }

  const links = await db.query.eventContactLinks.findMany({
    where: targets.length === 1 ? targets[0] : or(...targets),
    columns: { contactId: true },
  });
  if (links.length === 0) return;

  await db
    .update(schoolContacts)
    .set({ lastUsedYear: schoolYear, updatedAt: new Date() })
    .where(
      inArray(
        schoolContacts.id,
        links.map((l) => l.contactId)
      )
    );
}
