import {
  getCalendarClient,
  getSchoolGoogleCredentials,
  GoogleCredentials,
} from "@/lib/google";
import { db } from "@/lib/db";
import {
  calendarEvents,
  schoolCalendarIntegrations,
  schools,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface CalendarConfig {
  calendarId: string;
  schoolId: string;
  name?: string;
}

interface SchoolCalendarConfigs {
  schoolId: string;
  credentials: GoogleCredentials;
  calendars: CalendarConfig[];
}

async function getSchoolCalendarConfigs(): Promise<SchoolCalendarConfigs[]> {
  const results: SchoolCalendarConfigs[] = [];

  // Get all active schools
  const activeSchools = await db.query.schools.findMany({
    where: eq(schools.active, true),
  });

  for (const school of activeSchools) {
    // Get Google credentials for this school
    const credentials = await getSchoolGoogleCredentials(school.id);
    if (!credentials) {
      // School doesn't have Google credentials configured, skip
      continue;
    }

    // Get calendar integrations for this school
    const calendarIntegrations =
      await db.query.schoolCalendarIntegrations.findMany({
        where: eq(schoolCalendarIntegrations.schoolId, school.id),
      });

    const activeCalendars = calendarIntegrations.filter((c) => c.active);

    if (activeCalendars.length > 0) {
      results.push({
        schoolId: school.id,
        credentials,
        calendars: activeCalendars.map((c) => ({
          calendarId: c.calendarId,
          schoolId: school.id,
          name: c.name ?? undefined,
        })),
      });
    }
  }

  return results;
}

export async function syncGoogleCalendars() {
  const schoolConfigs = await getSchoolCalendarConfigs();

  if (schoolConfigs.length === 0) {
    console.log(
      "No schools with Google credentials and calendar integrations configured, skipping sync"
    );
    return { synced: 0, schoolsProcessed: 0 };
  }

  let totalSynced = 0;
  let schoolsProcessed = 0;

  for (const schoolConfig of schoolConfigs) {
    const calendar = getCalendarClient(schoolConfig.credentials);

    for (const config of schoolConfig.calendars) {
      try {
        const response = await calendar.events.list({
          calendarId: config.calendarId,
          timeMin: new Date().toISOString(),
          maxResults: 250,
          singleEvents: true,
          orderBy: "startTime",
        });

        const events = response.data.items ?? [];

        for (const event of events) {
          if (!event.id || !event.summary) continue;

          const startTime = event.start?.dateTime || event.start?.date;
          const endTime = event.end?.dateTime || event.end?.date;

          if (!startTime) continue;

          const existing = await db.query.calendarEvents.findFirst({
            where: eq(calendarEvents.googleEventId, event.id),
          });

          const eventData = {
            googleEventId: event.id,
            schoolId: config.schoolId,
            title: event.summary,
            description: event.description ?? null,
            startTime: new Date(startTime),
            endTime: endTime ? new Date(endTime) : null,
            location: event.location ?? null,
            calendarSource: config.calendarId,
            eventType: inferEventType(config.calendarId, config.name),
            lastSynced: new Date(),
          };

          if (existing) {
            await db
              .update(calendarEvents)
              .set(eventData)
              .where(eq(calendarEvents.id, existing.id));
          } else {
            await db.insert(calendarEvents).values(eventData);
          }

          totalSynced++;
        }
      } catch (error) {
        console.error(`Failed to sync calendar ${config.calendarId}:`, error);
      }
    }

    schoolsProcessed++;
  }

  return { synced: totalSynced, schoolsProcessed };
}

function inferEventType(calendarId: string, name?: string): string {
  const searchStr = (calendarId + (name || "")).toLowerCase();
  if (searchStr.includes("classroom")) return "classroom";
  if (searchStr.includes("pta")) return "pta";
  return "school";
}

export async function syncSchoolCalendars(schoolId: string) {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return { synced: 0, error: "No Google credentials configured" };
  }

  const calendarIntegrations =
    await db.query.schoolCalendarIntegrations.findMany({
      where: eq(schoolCalendarIntegrations.schoolId, schoolId),
    });

  const activeCalendars = calendarIntegrations.filter((c) => c.active);
  if (activeCalendars.length === 0) {
    return { synced: 0, error: "No active calendars configured" };
  }

  const calendar = getCalendarClient(credentials);
  let totalSynced = 0;
  const errors: string[] = [];

  for (const config of activeCalendars) {
    try {
      const response = await calendar.events.list({
        calendarId: config.calendarId,
        timeMin: new Date().toISOString(),
        maxResults: 250,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items ?? [];

      for (const event of events) {
        if (!event.id || !event.summary) continue;

        const startTime = event.start?.dateTime || event.start?.date;
        const endTime = event.end?.dateTime || event.end?.date;

        if (!startTime) continue;

        const existing = await db.query.calendarEvents.findFirst({
          where: eq(calendarEvents.googleEventId, event.id),
        });

        const eventData = {
          googleEventId: event.id,
          schoolId: schoolId,
          title: event.summary,
          description: event.description ?? null,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          location: event.location ?? null,
          calendarSource: config.calendarId,
          eventType: inferEventType(config.calendarId, config.name ?? undefined),
          lastSynced: new Date(),
        };

        if (existing) {
          await db
            .update(calendarEvents)
            .set(eventData)
            .where(eq(calendarEvents.id, existing.id));
        } else {
          await db.insert(calendarEvents).values(eventData);
        }

        totalSynced++;
      }
    } catch (error) {
      const calendarName = config.name || config.calendarId;
      const errorMessage =
        error instanceof Error && (error as { status?: number }).status === 404
          ? `Calendar "${calendarName}" not found - share it with your service account`
          : `Failed to sync "${calendarName}"`;
      errors.push(errorMessage);
      console.error(`Failed to sync calendar ${config.calendarId}:`, error);
    }
  }

  if (errors.length > 0 && totalSynced === 0) {
    return { synced: 0, error: errors[0] };
  }

  return { synced: totalSynced, errors: errors.length > 0 ? errors : undefined };
}
