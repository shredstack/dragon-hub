import { generateStructuredJson } from "./structured";
import type { PtaBoardPosition } from "@/types";
import { fallbackPositionLabel } from "@/lib/board-positions-shared";

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
  /**
   * The school's own name for the position. Passed in rather than looked up
   * here so this module stays free of DB access; falls back to a formatted
   * slug when a caller has no label to hand.
   */
  positionLabel?: string;
  schoolName?: string;
}

/**
 * Generate structured handoff notes from raw text notes
 * Takes unstructured notes and organizes them into the 5 handoff note fields
 */
export async function generateHandoffFromNotes(
  context: GenerateHandoffContext
): Promise<GeneratedHandoffNote> {
  const positionLabel =
    context.positionLabel ?? fallbackPositionLabel(context.position);

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

Organize the notes into the five handoff categories described by the output schema.`;

  const userPrompt = `Please organize these notes from the outgoing ${positionLabel}${context.schoolName ? ` at ${context.schoolName}` : ""} into a structured handoff document:

---
${context.rawNotes}
---

Extract and organize all relevant information into the 5 handoff categories. Format each section clearly with bullet points or short paragraphs.`;

  const parsed = await generateStructuredJson<GeneratedHandoffNote>({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 4096,
    schema: {
      type: "object",
      properties: {
        keyAccomplishments: {
          type: "string",
          description:
            "Accomplishments, wins, completed projects, successes.",
        },
        ongoingProjects: {
          type: "string",
          description:
            "In-progress work, upcoming initiatives, things the successor should continue.",
        },
        tipsAndAdvice: {
          type: "string",
          description: "Lessons learned, best practices, warnings, recommendations.",
        },
        importantContacts: {
          type: "string",
          description:
            "People to know, vendors, school staff, committee members with contact info.",
        },
        filesAndResources: {
          type: "string",
          description:
            "Links to documents, spreadsheets, templates, important files.",
        },
      },
      required: [
        "keyAccomplishments",
        "ongoingProjects",
        "tipsAndAdvice",
        "importantContacts",
        "filesAndResources",
      ],
      additionalProperties: false,
    },
  });

  // Validate and normalize the response
  return {
    keyAccomplishments: parsed.keyAccomplishments || "",
    ongoingProjects: parsed.ongoingProjects || "",
    tipsAndAdvice: parsed.tipsAndAdvice || "",
    importantContacts: parsed.importantContacts || "",
    filesAndResources: parsed.filesAndResources || "",
  };
}
