import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface ExtractedArticle {
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string[];
  confidence: "high" | "medium" | "low";
}

export interface ExtractionResult {
  articles: ExtractedArticle[];
  skipped: string[];
}

/**
 * Extract knowledge articles from meeting minutes using AI.
 */
export async function extractKnowledgeFromMinutes(
  minutesText: string,
  meetingDate: string | null,
  existingArticleTitles: string[]
): Promise<ExtractionResult> {
  const formattedDate = meetingDate
    ? new Date(meetingDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown date";

  const prompt = `You are a knowledge management specialist for a PTA (Parent Teacher Association).
Analyze the following meeting minutes and extract valuable institutional knowledge that should be preserved.

Meeting Date: ${formattedDate}

MEETING MINUTES:
${minutesText}

EXISTING ARTICLES (avoid duplicating these):
${existingArticleTitles.length > 0 ? existingArticleTitles.join("\n") : "None"}

Extract knowledge articles about:
- Event planning details (timelines, vendor contacts, lessons learned)
- Processes and procedures discussed
- Budget decisions and financial guidelines
- Volunteer coordination best practices
- Important decisions that affect future planning
- Recurring event information (what worked, what didn't)

For each article, provide:
1. A clear, descriptive title
2. A brief summary (1-2 sentences)
3. The full article body in Markdown format
4. A category (one of: Events, Policies, Procedures, Budgets, Volunteers, Fundraising, Communications, Onboarding)
5. Relevant tags (3-5 tags)
6. Confidence level: "high" (clear, detailed info), "medium" (good info but may need expansion), "low" (minimal info, may want to skip)

Skip topics that are:
- Too brief or vague to be useful
- Duplicate existing articles
- Personal opinions without actionable information
- Routine announcements with no lasting value

Respond in JSON format:
{
  "articles": [
    {
      "title": "Article Title",
      "summary": "Brief summary",
      "body": "Full markdown content...",
      "category": "Category",
      "tags": ["tag1", "tag2"],
      "confidence": "high"
    }
  ],
  "skipped": ["Reason 1 for skipped topic", "Reason 2..."]
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
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

    const result = JSON.parse(jsonText) as ExtractionResult;
    return result;
  } catch {
    console.error("Failed to parse AI response:", content.text);
    throw new Error("Failed to parse knowledge extraction results");
  }
}
