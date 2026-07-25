import { generateStructuredJson } from "./structured";

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

For each skipped topic, add a short reason to "skipped".`;

  return generateStructuredJson<ExtractionResult>({
    prompt,
    maxTokens: 4096,
    schema: {
      type: "object",
      properties: {
        articles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              summary: { type: "string", description: "1-2 sentence summary." },
              body: { type: "string", description: "Full article body in Markdown." },
              category: {
                type: "string",
                enum: [
                  "Events",
                  "Policies",
                  "Procedures",
                  "Budgets",
                  "Volunteers",
                  "Fundraising",
                  "Communications",
                  "Onboarding",
                ],
              },
              tags: {
                type: "array",
                items: { type: "string" },
                description: "3-5 relevant tags.",
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
            },
            required: ["title", "summary", "body", "category", "tags", "confidence"],
            additionalProperties: false,
          },
        },
        skipped: {
          type: "array",
          items: { type: "string" },
          description: "Reasons for topics that were intentionally skipped.",
        },
      },
      required: ["articles", "skipped"],
      additionalProperties: false,
    },
  });
}
