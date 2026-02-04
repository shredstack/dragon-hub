import Anthropic from "@anthropic-ai/sdk";
import { KNOWLEDGE_CATEGORIES } from "@/lib/constants";

const anthropic = new Anthropic();

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
  const categories = KNOWLEDGE_CATEGORIES.join(", ");

  // Truncate very large files to avoid token limits
  const maxChars = 80_000;
  const content =
    fileContent.length > maxChars
      ? fileContent.slice(0, maxChars) + "\n\n[Content truncated...]"
      : fileContent;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are helping a PTA (Parent Teacher Association) organize their knowledge base. Based on the following document content, generate a knowledge article entry.

File name: ${fileName}

Document content:
---
${content}
---

Return a JSON object with these fields:
- "title": A clear, concise title for the article (not just the file name)
- "description": A 2-3 sentence summary of what this document contains and why it's useful
- "category": One of: ${categories}
- "tags": An array of 2-5 relevant tags (lowercase, short phrases)

Return ONLY the JSON object, no other text.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Parse JSON from response, handling possible markdown code blocks
  const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    title: parsed.title || fileName,
    description: parsed.description || "",
    category: KNOWLEDGE_CATEGORIES.includes(parsed.category)
      ? parsed.category
      : "Other",
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}
