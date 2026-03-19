import { anthropic } from "./client";

const VISION_MODEL = "claude-opus-4-20250514";

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
    model: VISION_MODEL,
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
            text: `You are an expert transcriber. Your task is to produce a FAITHFUL, EXACT transcription of all handwritten or whiteboard text visible in this image.

APPROACH — follow these steps carefully:
1. First, scan the ENTIRE image to understand the overall layout (columns, sections, headers, etc.).
2. Then work through the image systematically — top to bottom, left to right — transcribing every word you see.
3. For each word, look carefully at every letter. Read what is ACTUALLY written, not what you think should be written. Do not auto-correct spelling, do not substitute synonyms, and do not paraphrase.
4. If a word is hard to read, slow down and examine each character individually before writing it down. Only mark it as [illegible] if you truly cannot determine the characters.

TRANSCRIPTION RULES:
- Copy every word EXACTLY as written, including abbreviations, shorthand, misspellings, and informal language.
- Preserve the spatial layout using line breaks and indentation.
- Separate distinct sections, columns, or boxed areas with dividers (---).
- Note arrows or connections as [arrow to: X].
- Mark truly unreadable words as [illegible]. If you're uncertain, write "word?" with a question mark.
- Describe drawings or symbols briefly in [brackets], e.g., [checkmark], [star symbol].
- Preserve bullet points, numbering, underlines, and other organizational marks.
- Note marker colors if visible, e.g., [in red:].

COMMON MISTAKES TO AVOID:
- Do NOT substitute a different word that "makes more sense" — transcribe what is written.
- Do NOT skip over small words, annotations, or margin notes.
- Do NOT merge separate lines or list items into one.
- Do NOT add words, punctuation, or context that is not in the image.

Respond in JSON format:
{
  "rawText": "The exact transcription preserving layout...",
  "confidence": "high | medium | low",
  "warnings": ["Any issues like 'Bottom-left corner partially cut off'"],
  "layoutDescription": "Brief description of content arrangement"
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
    model: VISION_MODEL,
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
    model: VISION_MODEL,
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
