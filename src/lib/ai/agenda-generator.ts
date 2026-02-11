import { anthropic, DEFAULT_MODEL } from "./client";

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
 * Generate a meeting agenda based on historical minutes and agendas.
 */
export async function generateAgendaFromHistory(
  targetMonth: number,
  targetYear: number,
  historicalMinutes: DocumentSummary[],
  historicalAgendas: DocumentSummary[],
  recentMinutes: DocumentSummary[]
): Promise<AgendaResult> {
  const monthName = new Date(targetYear, targetMonth - 1).toLocaleString("en-US", {
    month: "long",
  });

  const formatDocument = (m: DocumentSummary) => {
    const date = m.meetingDate
      ? new Date(m.meetingDate).toLocaleDateString()
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

  const prompt = `You are helping a PTA (Parent Teacher Association) prepare for their ${monthName} ${targetYear} meeting.

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

1. **Standard Items** - Call to order, approval of previous minutes, treasurer's report
2. **Seasonal Topics** - Events and activities typical for ${monthName} based on historical patterns from both previous agendas and minutes
3. **Follow-up Items** - Action items and topics from recent meetings that need follow-up
4. **New Business** - Placeholder for new topics
5. **Announcements** - Upcoming dates and reminders
6. **Adjournment**

Format the agenda in Markdown with clear sections and time estimates where appropriate.
Make it practical and actionable, with specific references to past discussions where relevant.
Pay special attention to the historical agendas as they show what items were planned, and the historical minutes show what actually happened.

After the agenda, list which source documents were most useful.

Respond in JSON format:
{
  "agenda": "# PTA Meeting Agenda\\n\\n## ${monthName} ${targetYear}\\n\\n...",
  "sourcesUsed": ["filename1", "filename2"]
}`;

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  try {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonText = content.text;
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const result = JSON.parse(jsonText) as AgendaResult;
    return result;
  } catch {
    console.error("Failed to parse AI response:", content.text);
    // Return the raw text as the agenda if JSON parsing fails
    return {
      agenda: content.text,
      sourcesUsed: [],
    };
  }
}
