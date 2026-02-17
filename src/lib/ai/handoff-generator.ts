import { anthropic, DEFAULT_MODEL } from "./client";
import type { PtaBoardPosition } from "@/types";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";

export interface GeneratedHandoffNote {
  keyAccomplishments: string;
  ongoingProjects: string;
  tipsAndAdvice: string;
  importantContacts: string;
  filesAndResources: string;
}

interface GenerateHandoffContext {
  rawNotes: string;
  position: PtaBoardPosition;
  schoolName?: string;
}

/**
 * Generate structured handoff notes from raw text notes
 * Takes unstructured notes and organizes them into the 5 handoff note fields
 */
export async function generateHandoffFromNotes(
  context: GenerateHandoffContext
): Promise<GeneratedHandoffNote> {
  const positionLabel = PTA_BOARD_POSITIONS[context.position];

  const systemPrompt = `You are helping a PTA board member (${positionLabel}) organize their notes into a structured handoff document for their successor.

Your task is to take their raw, unstructured notes and organize them into 5 clear categories. Extract relevant information and present it in a clean, readable format.

GUIDELINES:
- Preserve the substance and specific details from the original notes
- Use bullet points or short paragraphs for readability
- If information doesn't fit a category, place it in the most relevant one
- If a category has no relevant information, provide a brief placeholder like "No specific notes provided"
- Keep the tone helpful and informative
- Don't add information that wasn't in the original notes
- Fix obvious typos but maintain the author's voice

OUTPUT FORMAT:
Return valid JSON with these exact fields:
{
  "keyAccomplishments": "Accomplishments, wins, completed projects, successes",
  "ongoingProjects": "In-progress work, upcoming initiatives, things the successor should continue",
  "tipsAndAdvice": "Lessons learned, best practices, warnings, recommendations",
  "importantContacts": "People to know, vendors, school staff, committee members with contact info",
  "filesAndResources": "Links to documents, spreadsheets, templates, important files"
}

Return ONLY valid JSON, no other text.`;

  const userPrompt = `Please organize these notes from the outgoing ${positionLabel}${context.schoolName ? ` at ${context.schoolName}` : ""} into a structured handoff document:

---
${context.rawNotes}
---

Extract and organize all relevant information into the 5 handoff categories. Format each section clearly with bullet points or short paragraphs.`;

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  // Extract text content from response
  const textContent = message.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in AI response");
  }

  // Parse JSON response
  let responseText = textContent.text.trim();

  // Handle markdown code blocks if present
  if (responseText.startsWith("```json")) {
    responseText = responseText.slice(7);
  } else if (responseText.startsWith("```")) {
    responseText = responseText.slice(3);
  }
  if (responseText.endsWith("```")) {
    responseText = responseText.slice(0, -3);
  }
  responseText = responseText.trim();

  try {
    const parsed = JSON.parse(responseText) as GeneratedHandoffNote;

    // Validate and normalize the response
    return {
      keyAccomplishments: parsed.keyAccomplishments || "",
      ongoingProjects: parsed.ongoingProjects || "",
      tipsAndAdvice: parsed.tipsAndAdvice || "",
      importantContacts: parsed.importantContacts || "",
      filesAndResources: parsed.filesAndResources || "",
    };
  } catch (parseError) {
    console.error("Failed to parse AI response:", parseError);
    console.error("Response text:", responseText);
    throw new Error("Failed to parse AI-generated handoff notes");
  }
}
