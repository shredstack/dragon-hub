import { anthropic, DEFAULT_MODEL } from "./client";

export interface MinutesSummary {
  summary: string;
}

export interface MinutesAnalysis {
  // Date extraction
  extractedDate: string | null; // ISO date string YYYY-MM-DD
  dateConfidence: "high" | "medium" | "low";

  // Rich summary
  summary: string; // 2-4 sentence overview
  keyItems: string[]; // 3-8 key discussion points
  actionItems: string[]; // Action items with owners if mentioned
  improvements: string[]; // 2-4 suggestions for next time

  // Tags
  suggestedTags: string[]; // 3-7 topic tags
}

/**
 * Generate a comprehensive AI analysis of PTA meeting minutes.
 * Returns structured data including date extraction, rich summary, and tags.
 */
export async function generateMinutesAnalysis(
  textContent: string,
  fileName: string,
  existingTags: string[] = []
): Promise<MinutesAnalysis> {
  // Truncate to manage tokens (keep first 60KB)
  const maxChars = 60000;
  const truncatedContent =
    textContent.length > maxChars
      ? textContent.slice(0, maxChars) + "\n[Content truncated...]"
      : textContent;

  const existingTagsSection =
    existingTags.length > 0
      ? `\n\nEXISTING TAGS (prefer reusing these when applicable):\n${existingTags.join(", ")}`
      : "";

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are analyzing PTA (Parent Teacher Association) meeting minutes. Extract structured information from the following document.

File name: ${fileName}

Document content:
---
${truncatedContent}
---${existingTagsSection}

Analyze the document and return a JSON response with the following structure:

{
  "extractedDate": "YYYY-MM-DD or null if no clear date found",
  "dateConfidence": "high if exact date stated, medium if month/year only, low if uncertain",
  "summary": "2-4 sentence summary of the meeting",
  "keyItems": ["Array of 3-8 key discussion points, each 1-2 sentences"],
  "actionItems": ["Array of action items, including who is responsible if mentioned"],
  "improvements": ["Array of 2-4 suggestions for future meetings based on what was discussed"],
  "suggestedTags": ["Array of 3-7 topic tags like 'Field Day', 'Book Fair', 'Budget', 'Volunteers'"]
}

Guidelines:
- For extractedDate: Look for explicit dates like "January 15, 2025" or "Meeting held on 1/15/25". Convert to YYYY-MM-DD format.
- For keyItems: Focus on decisions made, topics debated, updates shared. Each should be a complete thought.
- For actionItems: Extract tasks assigned with deadlines/owners when mentioned. Format as "Task - Owner (deadline)" when available.
- For improvements: Suggest based on issues raised, recurring problems, or gaps noticed in the meeting.
- For suggestedTags: Use existing tags when they match. Create new ones only for clearly distinct topics.
  - Prefer general tags ("Field Day") over specific ones ("Spring Field Day 2025")
  - Include event names, program areas (Fundraising, Budget, Volunteers), and recurring themes
  - Aim for 3-7 tags total

Return ONLY valid JSON, no markdown formatting or code blocks.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from AI");
  }

  try {
    let jsonText = content.text;
    // Handle case where AI returns markdown code blocks despite instructions
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonText.trim());

    // Validate and coerce the response
    return {
      extractedDate: parsed.extractedDate || null,
      dateConfidence: ["high", "medium", "low"].includes(parsed.dateConfidence)
        ? parsed.dateConfidence
        : "low",
      summary: parsed.summary || "",
      keyItems: Array.isArray(parsed.keyItems) ? parsed.keyItems : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      improvements: Array.isArray(parsed.improvements)
        ? parsed.improvements
        : [],
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags
        : [],
    };
  } catch (error) {
    console.error("Failed to parse AI response:", content.text, error);
    // Return a minimal result on parse failure
    return {
      extractedDate: null,
      dateConfidence: "low",
      summary: content.text.slice(0, 500),
      keyItems: [],
      actionItems: [],
      improvements: [],
      suggestedTags: [],
    };
  }
}

/**
 * Generate a simple AI summary of PTA meeting minutes.
 * Returns a concise 2-4 sentence summary of the key discussion points.
 * @deprecated Use generateMinutesAnalysis for richer output
 */
export async function generateMinutesSummary(
  textContent: string,
  fileName: string
): Promise<MinutesSummary> {
  const result = await generateMinutesAnalysis(textContent, fileName, []);
  return { summary: result.summary };
}
