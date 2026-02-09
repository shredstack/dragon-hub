import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface MinutesSummary {
  summary: string;
}

/**
 * Generate an AI summary of PTA meeting minutes.
 * Returns a concise 2-4 sentence summary of the key discussion points.
 */
export async function generateMinutesSummary(
  textContent: string,
  fileName: string
): Promise<MinutesSummary> {
  // Truncate to manage tokens (keep first 60KB)
  const maxChars = 60000;
  const truncatedContent =
    textContent.length > maxChars
      ? textContent.slice(0, maxChars) + "\n[Content truncated...]"
      : textContent;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are analyzing PTA (Parent Teacher Association) meeting minutes. Extract key information from the following document.

File name: ${fileName}

Document content:
---
${truncatedContent}
---

Write a concise 2-4 sentence summary of the meeting that captures the most important topics discussed, decisions made, and action items mentioned. Focus on what would be most useful for someone who missed the meeting.

Return ONLY the summary text, no other formatting or explanation.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  return {
    summary: text.trim(),
  };
}
