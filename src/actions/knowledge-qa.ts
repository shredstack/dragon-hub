"use server";

import { anthropic, DEFAULT_MODEL } from "@/lib/ai/client";
import {
  semanticSearch,
  DEFAULT_MIN_SIMILARITY,
  type SearchResult,
  type ViewableDocumentRef,
} from "@/lib/ai/vector-search";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertPtaBoardMember,
  isPtaBoardMember,
} from "@/lib/auth-helpers";

export interface QASource {
  type: SearchResult["type"];
  title: string;
  url?: string;
  snippet: string;
  /**
   * Present when the source is a file, so the answer can be checked against
   * the document itself without downloading it — following a citation to a
   * spreadsheet is the whole point of asking what an event cost.
   */
  document?: ViewableDocumentRef;
}

export interface QAResponse {
  answer: string;
  sources: QASource[];
  confidence: "high" | "medium" | "low" | "no_data";
}

/**
 * Ask a question and get an answer grounded in DragonHub data.
 * Uses RAG (Retrieval-Augmented Generation) to find relevant information
 * and synthesize an accurate answer with citations.
 *
 * Access restricted to: school admins, PTA board members, and super admins.
 */
export async function askKnowledgeBase(question: string): Promise<QAResponse> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Authorization check - only PTA board, school admins, or super admins
  await assertPtaBoardMember(user.id!, schoolId);

  // Validate question
  if (!question || question.trim().length < 3) {
    return {
      answer: "Please provide a longer question to search for.",
      sources: [],
      confidence: "no_data",
    };
  }

  // 1. Semantic search for relevant content
  const searchResults = await semanticSearch(schoolId, question, {
    limit: 10,
    minSimilarity: DEFAULT_MIN_SIMILARITY,
  });

  // 2. Check if we have anything to answer from.
  // No second filter here on purpose: semanticSearch already applied the floor
  // and ranked globally, and re-filtering at a higher number is what previously
  // discarded documents that held the answer. See DEFAULT_MIN_SIMILARITY.
  if (searchResults.length === 0) {
    return {
      answer:
        "I couldn't find any relevant information about this topic in DragonHub. This might be something that hasn't been documented yet, or it could be in Google Drive documents that haven't been indexed. Try asking about:\n\n- Budget categories and spending\n- Past events and event plans\n- Fundraiser results\n- Board member handoff notes and tips\n- Knowledge Base articles",
      sources: [],
      confidence: "no_data",
    };
  }

  // 3. Build context for the LLM
  const context = searchResults
    .map((r, i) => {
      let metadataStr = "";
      if (r.metadata) {
        const entries = Object.entries(r.metadata)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${k}: ${v}`);
        if (entries.length > 0) {
          metadataStr = `\nDetails: ${entries.join(", ")}`;
        }
      }
      return `[Source ${i + 1}: ${r.title}]\n${r.content}${metadataStr}`;
    })
    .join("\n\n---\n\n");

  // 4. Generate answer with Claude
  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: `You are a helpful assistant for a PTA (Parent Teacher Association) answering questions based ONLY on the provided context. Your answers must be grounded in the data shown — never make up information.

CONTEXT FROM DRAGONHUB:
${context}

---

USER QUESTION: ${question}

INSTRUCTIONS:
1. Answer the question using ONLY the information from the context above.
2. If the context partially answers the question, provide what you can and clearly state what's missing.
3. If the context doesn't contain relevant information, say so — do not guess or make up data.
4. Be conversational and helpful, but concise (2-4 paragraphs max).
5. Reference specific sources when stating facts (e.g., "According to the Budget data..." or "The Fall Festival event plan shows...").
6. For numerical data (budgets, amounts raised), always cite the exact figures from the context.
7. If you find conflicting information between sources, mention both and note the discrepancy.
8. Use bullet points or lists when appropriate for readability.

Respond with a helpful answer that a PTA board member would find useful.`,
      },
    ],
  });

  const answer =
    message.content[0].type === "text"
      ? message.content[0].text
      : "Unable to generate an answer.";

  // 5. Determine confidence from the best source, not the average.
  // An answer is only as good as the strongest thing supporting it, and
  // averaging punishes a solid match for the weaker context retrieved
  // alongside it. Bands match the scale real content actually occupies —
  // against the old 0.7/0.6 bands every correct answer reported "low".
  const bestSimilarity = Math.max(
    ...searchResults.map((r) => r.similarity)
  );
  const confidence: QAResponse["confidence"] =
    bestSimilarity > 0.5 ? "high" : bestSimilarity > 0.42 ? "medium" : "low";

  // 6. Format sources for display
  const sources: QASource[] = searchResults.map((r) => ({
    type: r.type,
    title: r.title,
    url: r.url,
    snippet: r.content.slice(0, 150) + (r.content.length > 150 ? "..." : ""),
    document: r.document,
  }));

  return { answer, sources, confidence };
}

/**
 * Check if the current user can access the Knowledge Q&A feature.
 * Returns true for school admins, PTA board members, and super admins.
 */
export async function canUseKnowledgeQA(): Promise<boolean> {
  try {
    const user = await assertAuthenticated();
    const schoolId = await getCurrentSchoolId();
    if (!schoolId || !user.id) return false;

    return await isPtaBoardMember(user.id, schoolId);
  } catch {
    return false;
  }
}
