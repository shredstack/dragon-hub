import { cache } from "react";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  EVENT_PLAN_SETTINGS_DEFAULTS,
  resolveEventPlanSettings,
  type EventPlanSettings,
} from "@/lib/event-plan-settings-shared";

// The types, defaults and clamping live in the client-safe module so the
// settings form can import them without dragging the database into the browser.
export * from "@/lib/event-plan-settings-shared";

/** Cached per request — the plan page asks, and so does every vote. */
export const getEventPlanSettings = cache(async function getEventPlanSettings(
  schoolId: string | null | undefined
): Promise<EventPlanSettings> {
  if (!schoolId) return EVENT_PLAN_SETTINGS_DEFAULTS;

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { eventPlanSettings: true },
  });

  return resolveEventPlanSettings(school?.eventPlanSettings);
});
