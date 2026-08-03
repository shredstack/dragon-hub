import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";
import {
  categoryOptions,
  categoryValues,
  isCategoryOf,
} from "@/lib/categories";
import { generateStructuredJson } from "./structured";

export interface GeneratedArticle {
  title: string;
  description: string;
  category: string;
  tags: string[];
}

export async function generateArticle(
  fileContent: string,
  fileName: string
): Promise<GeneratedArticle> {
  // The model picks a slug, not a label — the slug is what gets stored, and
  // asking for the label would only add a lossy translation step.
  const categorySlugs = categoryValues(KNOWLEDGE_CATEGORIES);
  const categories = categoryOptions(KNOWLEDGE_CATEGORIES)
    .map((c) => `${c.value} (${c.label})`)
    .join(", ");

  // Truncate very large files to avoid token limits
  const maxChars = 80_000;
  const content =
    fileContent.length > maxChars
      ? fileContent.slice(0, maxChars) + "\n\n[Content truncated...]"
      : fileContent;

  const parsed = await generateStructuredJson<{
    title?: string;
    description?: string;
    category?: string;
    tags?: string[];
  }>({
    maxTokens: 1024,
    prompt: `You are helping a PTA (Parent Teacher Association) organize their knowledge base. Based on the following document content, generate a knowledge article entry.

File name: ${fileName}

Document content:
---
${content}
---

- "title": A clear, concise title for the article (not just the file name)
- "description": A 2-3 sentence summary of what this document contains and why it's useful
- "category": One of: ${categories}
- "tags": 2-5 relevant tags (lowercase, short phrases)`,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string", enum: categorySlugs },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "description", "category", "tags"],
      additionalProperties: false,
    },
  });

  return {
    title: parsed.title || fileName,
    description: parsed.description || "",
    category: isCategoryOf(KNOWLEDGE_CATEGORIES, parsed.category)
      ? (parsed.category as string)
      : "other",
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}
