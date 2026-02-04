import { getCalendarClient } from "@/lib/google";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function syncGoogleCalendars() {
  const calendarIds = process.env.CALENDAR_IDS?.split(",").map((id) =>
    id.trim()
  );

  if (!calendarIds?.length) {
    console.log("No calendar IDs configured, skipping sync");
    return { synced: 0 };
  }

  const calendar = getCalendarClient();
  let totalSynced = 0;

  for (const calendarId of calendarIds) {
    try {
      const response = await calendar.events.list({
        calendarId,
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
          title: event.summary,
          description: event.description ?? null,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          location: event.location ?? null,
          calendarSource: calendarId,
          eventType: inferEventType(calendarId),
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
      console.error(`Failed to sync calendar ${calendarId}:`, error);
    }
  }

  return { synced: totalSynced };
}

function inferEventType(calendarId: string): string {
  const id = calendarId.toLowerCase();
  if (id.includes("classroom")) return "classroom";
  if (id.includes("pta")) return "pta";
  return "school";
}
