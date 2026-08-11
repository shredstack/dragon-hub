import { generateStructuredJson } from "./structured";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import { categoryOptions, categoryValues } from "@/lib/categories";
import { formatDateOnly } from "@/lib/date-only";

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
    ? formatDateOnly(meetingDate, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown date";

  // Read from the shared set rather than an inline list. This extractor used to
  // carry its own vocabulary — Procedures, Communications, Budgets, Onboarding —
  // and filed real articles under categories the picker and the category filter
  // had never heard of. Those four are in KNOWLEDGE_CATEGORIES now; the list
  // lives in one place so the two can't diverge again.
  const categorySlugs = categoryValues(KNOWLEDGE_CATEGORIES);
  const categoryChoices = categoryOptions(KNOWLEDGE_CATEGORIES)
    .map((c) => `${c.value} (${c.label})`)
    .join(", ");

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
4. A category (use one of these exact values: ${categoryChoices})
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
              category: { type: "string", enum: categorySlugs },
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
