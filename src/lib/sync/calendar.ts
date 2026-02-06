import { getCalendarClient } from "@/lib/google";
import { db } from "@/lib/db";
import { calendarEvents, schoolCalendarIntegrations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface CalendarConfig {
  calendarId: string;
  schoolId: string | null;
  name?: string;
}

async function getCalendarConfigs(): Promise<CalendarConfig[]> {
  const configs: CalendarConfig[] = [];

  // Get all active calendar integrations from the database (per school)
  const dbIntegrations = await db.query.schoolCalendarIntegrations.findMany({
    where: eq(schoolCalendarIntegrations.active, true),
  });

  for (const integration of dbIntegrations) {
    configs.push({
      calendarId: integration.calendarId,
      schoolId: integration.schoolId,
      name: integration.name ?? undefined,
    });
  }

  // Fallback to env var if no database configs exist
  if (configs.length === 0) {
    const envCalendarIds = process.env.CALENDAR_IDS?.split(",").map((id) =>
      id.trim()
    );
    if (envCalendarIds?.length) {
      for (const calendarId of envCalendarIds) {
        configs.push({
          calendarId,
          schoolId: null,
        });
      }
    }
  }

  return configs;
}

export async function syncGoogleCalendars() {
  const calendarConfigs = await getCalendarConfigs();

  if (calendarConfigs.length === 0) {
    console.log("No calendar IDs configured, skipping sync");
    return { synced: 0 };
  }

  const calendar = getCalendarClient();
  let totalSynced = 0;

  for (const config of calendarConfigs) {
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

  return { synced: totalSynced };
}

function inferEventType(calendarId: string, name?: string): string {
  const searchStr = (calendarId + (name || "")).toLowerCase();
  if (searchStr.includes("classroom")) return "classroom";
  if (searchStr.includes("pta")) return "pta";
  return "school";
}
