import { generateStructuredJson } from "./structured";
import { formatDateInTimeZone } from "@/lib/time-zone";

interface DocumentSummary {
  fileName: string;
  meetingDate: string | null;
  aiSummary: string | null;
  schoolYear: string;
  documentType?: "minutes" | "agenda";
}

export interface AgendaResult {
  agenda: string;
  sourcesUsed: string[];
}

/**
 * The real meeting off the school's Google Calendar, already formatted in the
 * school's own zone by the caller. The model used to invent a date and time
 * here, and it had no way not to — nothing in the prompt told it when the
 * meeting was.
 */
export interface ScheduledMeeting {
  /** "Wednesday, August 12, 2026" */
  date: string;
  /** "10:30 AM" — null for an all-day calendar entry. */
  time: string | null;
  /** "6:30 PM" when the calendar gives an end. */
  endTime: string | null;
  location: string | null;
  title: string;
}

/**
 * Generate a meeting agenda based on historical minutes and agendas.
 */
export async function generateAgendaFromHistory(
  targetMonth: number,
  targetYear: number,
  historicalMinutes: DocumentSummary[],
  historicalAgendas: DocumentSummary[],
  recentMinutes: DocumentSummary[],
  scheduledMeeting?: ScheduledMeeting | null
): Promise<AgendaResult> {
  const monthName = new Date(targetYear, targetMonth - 1).toLocaleString("en-US", {
    month: "long",
  });

  const formatDocument = (m: DocumentSummary) => {
    // meetingDate is a date-only column ("2026-08-12"), which parses as midnight
    // UTC — read it back in UTC or a western server reports the day before.
    const date = m.meetingDate
      ? formatDateInTimeZone(m.meetingDate, "UTC")
      : "Unknown date";
    return `### ${m.fileName} (${date})\n${m.aiSummary || "No summary available"}`;
  };

  const historicalMinutesContext = historicalMinutes.length > 0
    ? historicalMinutes.map(formatDocument).join("\n\n")
    : "No historical minutes available for this month.";

  const historicalAgendasContext = historicalAgendas.length > 0
    ? historicalAgendas.map(formatDocument).join("\n\n")
    : "No historical agendas available for this month.";

  const recentContext = recentMinutes.length > 0
    ? recentMinutes.map(formatDocument).join("\n\n")
    : "No recent minutes available.";

  // Ground the header in the calendar rather than letting the model guess. When
  // the calendar has no matching entry, say so explicitly — an unanswered
  // question in a prompt gets answered by invention.
  const meetingDetails = scheduledMeeting
    ? `## Meeting Details (from the school's Google Calendar — authoritative)

- Calendar entry: ${scheduledMeeting.title}
- Date: ${scheduledMeeting.date}
${scheduledMeeting.time ? `- Start time: ${scheduledMeeting.time}${scheduledMeeting.endTime ? `\n- End time: ${scheduledMeeting.endTime}` : ""}` : "- Time: all-day entry, no specific start time"}
${scheduledMeeting.location ? `- Location: ${scheduledMeeting.location}` : ""}

Use exactly this date${scheduledMeeting.time ? " and start time" : ""} in the agenda header. Do not adjust, round, or restate it in another form.`
    : `## Meeting Details

No meeting for ${monthName} ${targetYear} was found on the school's Google Calendar. Do NOT invent a date or time — write the header with placeholders such as "Date: TBD" and "Time: TBD" for the board to fill in.`;

  const prompt = `You are helping a PTA (Parent Teacher Association) prepare for their ${monthName} ${targetYear} meeting.

${meetingDetails}

Based on the following historical documents and recent meeting minutes, generate a comprehensive meeting agenda.

## Historical Minutes from ${monthName} (Previous Years)
These show what topics were actually discussed during this time of year:

${historicalMinutesContext}

## Historical Agendas from ${monthName} (Previous Years)
These show what was planned for meetings during this time of year:

${historicalAgendasContext}

## Recent Meeting Minutes
These show current ongoing topics and action items:

${recentContext}

## Instructions

Generate a meeting agenda for ${monthName} ${targetYear} that includes:

0. **Header** - The meeting date, start time and location exactly as given in "Meeting Details" above (or TBD placeholders if none were given). Never take a date or time from the historical documents below — those are previous years' meetings.

1. **Standard Items** - Call to order, approval of previous minutes, treasurer's report
2. **Seasonal Topics** - Events and activities typical for ${monthName} based on historical patterns from both previous agendas and minutes
3. **Follow-up Items** - Action items and topics from recent meetings that need follow-up
4. **New Business** - Placeholder for new topics
5. **Announcements** - Upcoming dates and reminders
6. **Adjournment**

Format the agenda in Markdown with clear sections and time estimates where appropriate.
Make it practical and actionable, with specific references to past discussions where relevant.
Pay special attention to the historical agendas as they show what items were planned, and the historical minutes show what actually happened.

After the agenda, list which source documents were most useful.`;

  try {
    return await generateStructuredJson<AgendaResult>({
      prompt,
      maxTokens: 4096,
      schema: {
        type: "object",
        properties: {
          agenda: {
            type: "string",
            description:
              "The full meeting agenda in Markdown, with clear sections and time estimates where appropriate.",
          },
          sourcesUsed: {
            type: "array",
            items: { type: "string" },
            description: "File names of the source documents that were most useful.",
          },
        },
        required: ["agenda", "sourcesUsed"],
        additionalProperties: false,
      },
    });
  } catch (error) {
    console.error("Failed to generate agenda:", error);
    return { agenda: "", sourcesUsed: [] };
  }
}
