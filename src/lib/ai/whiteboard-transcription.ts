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
