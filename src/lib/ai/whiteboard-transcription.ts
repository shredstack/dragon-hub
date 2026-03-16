import { anthropic, DEFAULT_MODEL } from "./client";

export interface TranscriptionResult {
  rawText: string; // Exact transcription of what's written
  confidence: "high" | "medium" | "low";
  warnings: string[]; // e.g., "Some text in the bottom-right was partially obscured"
  layoutDescription: string; // Brief description of how content was arranged
}

export interface OrganizedContent {
  sections: Array<{
    heading: string;
    content: string; // HTML formatted
  }>;
  actionItems: string[]; // Extracted action items if any
  summary: string; // 1-2 sentence summary
}

/**
 * Transcribe handwritten or whiteboard content from an image.
 * This is Pass 1 — focused purely on accurate text extraction.
 * No interpretation or reorganization.
 */
export async function transcribeWhiteboardImage(
  imageUrl: string
): Promise<TranscriptionResult> {
  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: imageUrl,
            },
          },
          {
            type: "text",
            text: `You are carefully transcribing handwritten or whiteboard content from this image. Your job is to produce an EXACT transcription of what is written — do not interpret, reorganize, summarize, or clean up the content.

CRITICAL RULES:
1. Transcribe EVERY word you can see, exactly as written (including abbreviations, shorthand, misspellings).
2. Preserve the spatial layout as much as possible using line breaks and indentation.
3. If content is grouped in columns, boxes, or sections on the board, separate them with clear dividers (---).
4. For arrows or connections between items, note them as [arrow to: X] or [connected to: Y].
5. If you cannot read a word, write [illegible] rather than guessing. If you're uncertain about a word, write it as "word?" with a question mark.
6. Include any drawings, diagrams, or symbols as brief descriptions in [brackets], e.g., [star symbol], [box drawn around this section], [checkmark].
7. Preserve bullet points, numbering, and any organizational marks exactly as written.
8. Note colors if different markers were used, e.g., [in red:] or [in blue:].

Respond in JSON format:
{
  "rawText": "The exact transcription preserving layout...",
  "confidence": "high if text is clear and fully legible, medium if some words are uncertain, low if significant portions are hard to read",
  "warnings": ["Array of specific issues, e.g., 'Bottom-left corner is partially cut off', 'Red marker text is faint'"],
  "layoutDescription": "Brief description of how content is arranged, e.g., 'Two columns with a header across the top. Left column has numbered items, right column has bullet points.'"
}

Return ONLY valid JSON.`,
          },
        ],
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  try {
    let jsonText = content.text;
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const parsed = JSON.parse(jsonText.trim());

    return {
      rawText: parsed.rawText || "",
      confidence: ["high", "medium", "low"].includes(parsed.confidence)
        ? parsed.confidence
        : "low",
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      layoutDescription: parsed.layoutDescription || "",
    };
  } catch (error) {
    console.error(
      "Failed to parse transcription response:",
      content.text,
      error
    );
    // Fallback: return the raw text as-is if JSON parsing fails
    return {
      rawText: content.text,
      confidence: "low",
      warnings: ["AI response could not be parsed as structured data"],
      layoutDescription: "",
    };
  }
}

/**
 * Organize raw transcribed text into structured meeting notes.
 * This is Pass 2 — takes user-corrected transcription and structures it.
 */
export async function organizeTranscribedContent(
  rawText: string,
  meetingContext: {
    meetingTitle: string;
    topic: string;
    agenda?: string;
  }
): Promise<OrganizedContent> {
  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are organizing raw transcribed notes from a PTA meeting whiteboard/handwritten notes into clean, structured meeting notes.

MEETING CONTEXT:
- Meeting: ${meetingContext.meetingTitle}
- Topic: ${meetingContext.topic}
${meetingContext.agenda ? `- Agenda: ${meetingContext.agenda}` : ""}

RAW TRANSCRIPTION (already verified for accuracy by the user):
${rawText}

INSTRUCTIONS:
1. Organize the content into logical sections with clear headings.
2. Clean up formatting but DO NOT change the meaning or add information that isn't in the transcription.
3. Convert shorthand and abbreviations to full words where the meaning is obvious (e.g., "vol" → "volunteers", "mtg" → "meeting"), but add [?] if you're uncertain about the expansion.
4. Preserve all items marked [illegible] — do not remove or guess at them.
5. Extract any action items (tasks, to-dos, follow-ups) into a separate list.
6. Format content as HTML (use <h3>, <p>, <ul>, <li> tags).
7. Write a brief 1-2 sentence summary of the overall content.

Respond in JSON format:
{
  "sections": [
    {
      "heading": "Section heading",
      "content": "<p>HTML formatted content...</p>"
    }
  ],
  "actionItems": ["Action item 1", "Action item 2"],
  "summary": "Brief summary of the whiteboard content"
}

Return ONLY valid JSON.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  try {
    let jsonText = content.text;
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const parsed = JSON.parse(jsonText.trim());

    return {
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      summary: parsed.summary || "",
    };
  } catch (error) {
    console.error("Failed to parse organization response:", content.text, error);
    // Fallback: return the raw text as a single section
    return {
      sections: [
        {
          heading: "Notes",
          content: `<p>${rawText.replace(/\n/g, "</p><p>")}</p>`,
        },
      ],
      actionItems: [],
      summary: "",
    };
  }
}

export interface FormattedMeetingNotes {
  formattedHtml: string;
}

/**
 * Format organized meeting notes into professional documentation.
 * This is Pass 3 — transforms structured notes into polished, professional format.
 */
export async function formatMeetingNotes(
  organizedContent: OrganizedContent,
  meetingContext: {
    meetingTitle: string;
    topic: string;
    meetingDate?: string;
    location?: string;
    attendees?: string[];
    eventTitle?: string;
    agenda?: string;
  }
): Promise<FormattedMeetingNotes> {
  // Build the sections text for the prompt
  const sectionsText = organizedContent.sections
    .map((s) => `## ${s.heading}\n${s.content}`)
    .join("\n\n");

  const actionItemsText =
    organizedContent.actionItems.length > 0
      ? organizedContent.actionItems.map((item) => `- ${item}`).join("\n")
      : "None extracted";

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `You are a professional meeting notes formatter for PTA (Parent Teacher Association) event planning. Transform these organized notes into polished, professional documentation.

OUTPUT FORMAT:
Generate clean HTML using these tags:
- <h2> for major sections (Meeting Overview, Schedule, Action Items, etc.)
- <h3> for subsections (individual topics, stations, agenda items)
- <p> for regular paragraphs
- <ul>/<li> for bullet lists (use nested <ul> for sub-bullets)
- <ol>/<li> for numbered lists when order matters
- <strong> for emphasis and key terms
- <em> for secondary emphasis
- <a href="url" target="_blank" rel="noopener noreferrer"> for links (preserve any URLs from the content)
- <span class="highlight"> for important dates, deadlines, and key numbers
- <br> for line breaks within sections

DOCUMENT STRUCTURE:

1. MEETING HEADER
Create a professional header section:
<h2>[Event Name] — [Meeting Title]</h2>
<div class="meeting-meta">
  <p><strong>Event:</strong> [Event title if available]</p>
  <p><strong>Meeting Date:</strong> [Date]</p>
  <p><strong>Location:</strong> [Location]</p>
  <p><strong>Attendees:</strong> [Names]</p>
  <p><strong>Topic:</strong> [Topic/Purpose]</p>
</div>

2. OVERVIEW SECTION (create this from the summary and key points)
<h2>Overview</h2>
<ul>
  <li><strong>Key Point 1:</strong> Brief description</li>
  <li><strong>Key Point 2:</strong> Brief description</li>
  <li><strong>Key Point 3:</strong> Brief description</li>
</ul>

3. DETAILED NOTES
- Use <h3> for each topic/category
- Use hierarchical bullet lists with nested <ul> for sub-items
- Use <strong> for key terms, names, and important items
- Wrap dates and deadlines in <span class="highlight">
- Preserve ALL information from the input

4. ACTION ITEMS SECTION (if any exist)
<h2>Action Items</h2>
<ul>
  <li><strong>Task description</strong> — Assignee (if known) — <span class="highlight">Deadline (if known)</span></li>
</ul>

5. NEXT STEPS / FOLLOW-UP (if mentioned in content)
<h2>Next Steps</h2>
<ul>
  <li>Pending decisions</li>
  <li>Questions to resolve</li>
  <li>Next meeting info</li>
</ul>

STYLE GUIDELINES:
- Professional but approachable tone
- Use consistent formatting throughout
- Preserve ALL information from the input — do not summarize or omit details
- Add structure and clarity through formatting, not by removing content
- Use whitespace effectively
- Keep bullet points concise but complete
- Make key information scannable (bold key terms, highlight dates)

MEETING CONTEXT:
- Event: ${meetingContext.eventTitle || "Event Planning"}
- Meeting Title: ${meetingContext.meetingTitle}
- Topic: ${meetingContext.topic}
- Date: ${meetingContext.meetingDate || "Not specified"}
- Location: ${meetingContext.location || "Not specified"}
- Attendees: ${meetingContext.attendees?.join(", ") || "Not recorded"}
${meetingContext.agenda ? `- Agenda: ${meetingContext.agenda}` : ""}

ORGANIZED CONTENT:
${sectionsText}

ACTION ITEMS (extracted):
${actionItemsText}

SUMMARY:
${organizedContent.summary || "No summary provided"}

Transform this into professional meeting documentation. Return ONLY the HTML content, no markdown code blocks or explanations.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  // Clean up the response - remove any markdown code blocks if present
  let formattedHtml = content.text.trim();
  const htmlMatch = formattedHtml.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (htmlMatch) {
    formattedHtml = htmlMatch[1].trim();
  }

  return {
    formattedHtml,
  };
}
