import { anthropic, DEFAULT_MODEL } from "./client";
import type { EmailAudience, EmailSectionType } from "@/types";

export interface GeneratedEmailSection {
  title: string;
  body: string;
  linkUrl?: string;
  linkText?: string;
  audience: EmailAudience;
  sectionType: EmailSectionType;
  recurringKey?: string;
}

export interface ContentSuggestion {
  title: string;
  reason: string;
  source: "calendar" | "minutes" | "pattern";
  priority: "high" | "medium" | "low";
  suggestedBlurb?: string;
}

export interface GeneratedEmail {
  sections: GeneratedEmailSection[];
  suggestions: ContentSuggestion[];
}

interface CalendarEventContext {
  title: string;
  startTime: string;
  description?: string;
  location?: string;
}

interface ContentItemContext {
  title: string;
  description?: string;
  linkUrl?: string;
  linkText?: string;
  audience: string;
  imageUrls: string[];
}

interface RecurringSectionContext {
  key: string;
  title: string;
  bodyTemplate: string;
  linkUrl?: string;
  imageUrl?: string;
  audience: string;
}

interface BoardMemberContext {
  name: string;
  position: string;
}

interface MinutesContext {
  meetingDate: string | null;
  aiSummary: string | null;
  aiKeyItems: string[] | null;
  aiActionItems: string[] | null;
}

interface GenerateEmailContext {
  schoolName: string;
  weekStart: string;
  weekEnd: string;
  calendarEvents: CalendarEventContext[];
  contentItems: ContentItemContext[];
  recurringSections: RecurringSectionContext[];
  boardMembers: BoardMemberContext[];
  previousEmailSections?: Array<{
    title: string;
    body: string;
  }>;
  // NEW: Lookahead events for next 2 weeks after weekEnd
  lookaheadEvents?: CalendarEventContext[];
  // NEW: Recent PTA minutes with AI analysis
  recentMinutes?: MinutesContext[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatDateRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

export async function generateWeeklyEmail(
  context: GenerateEmailContext
): Promise<GeneratedEmail> {
  const dateRange = formatDateRange(context.weekStart, context.weekEnd);

  // Format calendar events for prompt
  const eventsText =
    context.calendarEvents.length > 0
      ? context.calendarEvents
          .map((e) => {
            const date = new Date(e.startTime);
            const formattedDate = date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            const time = date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            return `- ${formattedDate} at ${time}: ${e.title}${e.location ? ` (${e.location})` : ""}`;
          })
          .join("\n")
      : "No scheduled events this week.";

  // Format content items for prompt
  const contentText =
    context.contentItems.length > 0
      ? context.contentItems
          .map(
            (item, i) =>
              `${i + 1}. "${item.title}"${item.description ? `: ${item.description}` : ""}${item.linkUrl ? ` [Link: ${item.linkUrl}]` : ""}${item.audience === "pta_only" ? " (PTA members only)" : ""}`
          )
          .join("\n")
      : "No submitted content items.";

  // Format recurring sections for prompt
  const recurringText = context.recurringSections
    .map((s) => `- ${s.key}: "${s.title}"`)
    .join("\n");

  // Format board members for sign-off
  const boardRoster = context.boardMembers
    .map((m) => `${m.name} - ${m.position}`)
    .join("\n");

  // Format lookahead events (next 2 weeks)
  const lookaheadText =
    context.lookaheadEvents && context.lookaheadEvents.length > 0
      ? context.lookaheadEvents
          .map((e) => {
            const date = new Date(e.startTime);
            const formattedDate = date.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            return `- ${formattedDate}: ${e.title}${e.location ? ` (${e.location})` : ""}`;
          })
          .join("\n")
      : "No upcoming events in the next 2 weeks.";

  // Format recent minutes
  const minutesText =
    context.recentMinutes && context.recentMinutes.length > 0
      ? context.recentMinutes
          .map((m, i) => {
            const dateStr = m.meetingDate
              ? new Date(m.meetingDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "Date unknown";
            const items = [
              m.aiSummary ? `Summary: ${m.aiSummary.slice(0, 200)}${m.aiSummary.length > 200 ? "..." : ""}` : null,
              m.aiKeyItems?.length
                ? `Key Items: ${m.aiKeyItems.slice(0, 3).join("; ")}`
                : null,
              m.aiActionItems?.length
                ? `Action Items: ${m.aiActionItems.slice(0, 3).join("; ")}`
                : null,
            ]
              .filter(Boolean)
              .join("\n  ");
            return `Meeting ${i + 1} (${dateStr}):\n  ${items}`;
          })
          .join("\n\n")
      : "No recent meeting minutes available.";

  const systemPrompt = `You are a PTA email writer for ${context.schoolName}. You write friendly, engaging weekly update emails for PTA members and the school community.

STYLE GUIDELINES:
- Use a warm, community-oriented tone
- Use occasional emoji to add personality (🎉 🍕 ⏰ 👉 📅)
- Keep descriptions concise (1-3 short paragraphs per section)
- Use calls to action when appropriate
- Section titles should be in ALL CAPS for emphasis
- Links should be included naturally in the text

HTML FORMATTING:
- Use <p> tags for paragraphs
- Use <strong> for emphasis
- Use <a href="url" target="_blank" rel="noopener noreferrer">text</a> for links
- Use <br> for line breaks within paragraphs when needed
- Keep HTML clean and simple

OUTPUT FORMAT:
Return valid JSON with this structure:
{
  "sections": [
    {
      "title": "SECTION TITLE IN CAPS",
      "body": "<p>HTML content...</p>",
      "linkUrl": "https://...",  // optional
      "linkText": "Click here",  // optional
      "audience": "all" | "pta_only",
      "sectionType": "calendar_summary" | "custom" | "recurring",
      "recurringKey": "join_pta"  // only if sectionType is "recurring"
    }
  ],
  "suggestions": [
    {
      "title": "Spirit Night at Chick-fil-A",
      "reason": "Scheduled for next Wednesday — families need advance notice",
      "source": "calendar" | "minutes" | "pattern",
      "priority": "high" | "medium" | "low",
      "suggestedBlurb": "<p>Optional HTML content draft...</p>"  // optional
    }
  ]
}`;

  const userPrompt = `Generate the weekly PTA email for ${context.schoolName}.
Week of ${dateRange}

CALENDAR EVENTS THIS WEEK:
${eventsText}

UPCOMING EVENTS (next 2 weeks after this email's week):
${lookaheadText}

RECENT PTA MEETING MINUTES:
${minutesText}

SUBMITTED CONTENT (create a section for each):
${contentText}

RECURRING SECTIONS TO INCLUDE:
${recurringText}

BOARD MEMBERS FOR SIGN-OFF:
${boardRoster}

INSTRUCTIONS:
1. Start with a "WEEK AT A GLANCE" section summarizing the calendar events (sectionType: "calendar_summary")
2. Create sections for each submitted content item (sectionType: "custom")
3. Include the recurring sections (sectionType: "recurring", include the recurringKey)
4. End with a board sign-off section (recurringKey: "board_signoff")
5. Review the upcoming events (next 2 weeks) and flag any that need ADVANCE NOTICE in THIS week's email (e.g., Spirit Nights, volunteer sign-up deadlines, spirit weeks, picture day, early dismissals). Include these as suggestions.
6. Review recent meeting minutes for:
   - Action items that should be communicated to the community
   - Decisions that affect families (policy changes, new programs)
   - Upcoming initiatives discussed but not yet on the calendar
   - Recurring events mentioned that may need reminders
7. Return a "suggestions" array alongside sections. Each suggestion should explain WHY it should be included and provide a draft blurb if useful. Mark priority as "high" for time-sensitive items (events within 5 days of the email week end), "medium" for upcoming items, "low" for nice-to-haves.

Mark sections as "pta_only" audience if they contain PTA-member-specific content (like membership drives).

Return ONLY valid JSON, no other text.`;

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  // Extract text content from response
  const textContent = message.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in AI response");
  }

  // Parse JSON response
  let responseText = textContent.text.trim();

  // Handle markdown code blocks if present
  if (responseText.startsWith("```json")) {
    responseText = responseText.slice(7);
  } else if (responseText.startsWith("```")) {
    responseText = responseText.slice(3);
  }
  if (responseText.endsWith("```")) {
    responseText = responseText.slice(0, -3);
  }
  responseText = responseText.trim();

  try {
    const parsed = JSON.parse(responseText) as GeneratedEmail;

    // Validate and normalize sections
    const sections: GeneratedEmailSection[] = parsed.sections.map((section) => ({
      title: section.title || "",
      body: section.body || "",
      linkUrl: section.linkUrl,
      linkText: section.linkText,
      audience: (section.audience === "pta_only" ? "pta_only" : "all") as EmailAudience,
      sectionType: (["recurring", "custom", "calendar_summary"].includes(
        section.sectionType
      )
        ? section.sectionType
        : "custom") as EmailSectionType,
      recurringKey: section.recurringKey,
    }));

    // Validate and normalize suggestions
    const suggestions: ContentSuggestion[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((s) => ({
          title: s.title || "",
          reason: s.reason || "",
          source: (["calendar", "minutes", "pattern"].includes(s.source)
            ? s.source
            : "calendar") as ContentSuggestion["source"],
          priority: (["high", "medium", "low"].includes(s.priority)
            ? s.priority
            : "medium") as ContentSuggestion["priority"],
          suggestedBlurb: s.suggestedBlurb || undefined,
        }))
      : [];

    return { sections, suggestions };
  } catch (parseError) {
    console.error("Failed to parse AI response:", parseError);
    console.error("Response text:", responseText);
    throw new Error("Failed to parse AI-generated email content");
  }
}
