import { db } from "@/lib/db";
import { schoolCalendarIntegrations } from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@/lib/time-zone";

/**
 * The school's effective IANA time zone, taken from its Google Calendar.
 *
 * There is no time-zone setting for a school and deliberately so — the board
 * already told Google where they are when they set up the calendar, and a second
 * setting is a second thing to get out of step. The PTA calendar wins over other
 * calendars because that's the one the board runs meetings from.
 *
 * Falls back to DEFAULT_TIME_ZONE for a school with no calendar synced yet.
 * Prefer an event's own `timeZone` column when you have the event in hand; this
 * is for surfaces that need a zone without one (month bounds, AI prompts).
 */
export async function getSchoolTimeZone(schoolId: string): Promise<string> {
  const integrations = await db
    .select({
      timeZone: schoolCalendarIntegrations.timeZone,
      calendarType: schoolCalendarIntegrations.calendarType,
    })
    .from(schoolCalendarIntegrations)
    .where(
      and(
        eq(schoolCalendarIntegrations.schoolId, schoolId),
        eq(schoolCalendarIntegrations.active, true),
        isNotNull(schoolCalendarIntegrations.timeZone)
      )
    );

  if (integrations.length === 0) return DEFAULT_TIME_ZONE;

  const pta = integrations.find((i) => i.calendarType === "pta");
  return resolveTimeZone((pta ?? integrations[0]).timeZone);
}
