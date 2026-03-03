import OpenAI from "openai";

const openai = new OpenAI();

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Generate an embedding for a single text string.
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate to ~8000 tokens (roughly 32000 chars) to stay within model limits
  const truncatedText = text.slice(0, 32000);

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncatedText,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch request.
 * More efficient than calling generateEmbedding multiple times.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Truncate each text
  const truncatedTexts = texts.map((t) => t.slice(0, 32000));

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncatedTexts,
  });

  // Results come back in same order as input
  return response.data.map((d) => d.embedding);
}
