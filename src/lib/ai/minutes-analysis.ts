import { generateStructuredJson } from "./structured";

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

  try {
    const parsed = await generateStructuredJson<{
      extractedDate?: string;
      dateConfidence?: string;
      summary?: string;
      keyItems?: string[];
      actionItems?: string[];
      improvements?: string[];
      suggestedTags?: string[];
    }>({
      maxTokens: 2048,
      prompt: `You are analyzing PTA (Parent Teacher Association) meeting minutes. Extract structured information from the following document.

File name: ${fileName}

Document content:
---
${truncatedContent}
---${existingTagsSection}

Guidelines:
- For extractedDate: Look for explicit dates like "January 15, 2025" or "Meeting held on 1/15/25". Convert to YYYY-MM-DD format. Use an empty string if no clear date is found.
- For dateConfidence: "high" if exact date stated, "medium" if month/year only, "low" if uncertain.
- For summary: a 2-4 sentence summary of the meeting.
- For keyItems: 3-8 key discussion points, each 1-2 sentences. Focus on decisions made, topics debated, updates shared. Each should be a complete thought.
- For actionItems: Extract tasks assigned with deadlines/owners when mentioned. Format as "Task - Owner (deadline)" when available.
- For improvements: 2-4 suggestions for future meetings based on issues raised, recurring problems, or gaps noticed in the meeting.
- For suggestedTags: 3-7 topic tags like 'Field Day', 'Book Fair', 'Budget', 'Volunteers'. Use existing tags when they match. Create new ones only for clearly distinct topics.
  - Prefer general tags ("Field Day") over specific ones ("Spring Field Day 2025")
  - Include event names, program areas (Fundraising, Budget, Volunteers), and recurring themes`,
      schema: {
        type: "object",
        properties: {
          extractedDate: {
            type: "string",
            description: "YYYY-MM-DD, or an empty string if no clear date found.",
          },
          dateConfidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
          summary: { type: "string" },
          keyItems: { type: "array", items: { type: "string" } },
          actionItems: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
          suggestedTags: { type: "array", items: { type: "string" } },
        },
        required: [
          "extractedDate",
          "dateConfidence",
          "summary",
          "keyItems",
          "actionItems",
          "improvements",
          "suggestedTags",
        ],
        additionalProperties: false,
      },
    });

    // Validate and coerce the response
    return {
      extractedDate: parsed.extractedDate || null,
      dateConfidence: (["high", "medium", "low"].includes(
        parsed.dateConfidence ?? ""
      )
        ? parsed.dateConfidence
        : "low") as "high" | "medium" | "low",
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
    console.error("Failed to analyze minutes:", error);
    // Return a minimal result on failure so callers can still proceed.
    return {
      extractedDate: null,
      dateConfidence: "low",
      summary: "",
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
