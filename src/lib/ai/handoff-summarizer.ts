import { generateStructuredJson } from "./structured";
import type { PtaBoardPosition } from "@/types";
import { fallbackPositionLabel } from "@/lib/board-positions-shared";

/**
 * A single distilled point from the position's accumulated handoff notes.
 * `years` records which school years said it, which is what makes the summary
 * trustworthy — a reader can see "three different treasurers said this" versus
 * "one person mentioned it once in 2022".
 */
export interface HandoffSummaryBullet {
  text: string;
  years: string[];
  recurring: boolean;
}

export interface HandoffSummarySection {
  title: string;
  bullets: HandoffSummaryBullet[];
}

export interface HandoffSummaryContent {
  overview: string;
  sections: HandoffSummarySection[];
}

export interface HandoffNoteForSummary {
  id: string;
  schoolYear: string;
  authorName?: string | null;
  keyAccomplishments?: string | null;
  ongoingProjects?: string | null;
  tipsAndAdvice?: string | null;
  importantContacts?: string | null;
  filesAndResources?: string | null;
}

interface SummarizeContext {
  notes: HandoffNoteForSummary[];
  position: PtaBoardPosition;
  /**
   * The school's own name for the position. Passed in rather than looked up
   * here so this module stays free of DB access; falls back to a formatted
   * slug when a caller has no label to hand.
   */
  positionLabel?: string;
  schoolName?: string;
}

const SECTION_TITLES = [
  "How the Role Works",
  "Recurring Projects & Timeline",
  "Tips & Lessons Learned",
  "People & Contacts",
  "Files & Resources",
] as const;

function formatNoteForPrompt(note: HandoffNoteForSummary): string {
  const author = note.authorName || "Unknown";
  const parts = [`--- ${note.schoolYear} — notes from ${author} ---`];
  if (note.keyAccomplishments)
    parts.push(`Key Accomplishments:\n${note.keyAccomplishments}`);
  if (note.ongoingProjects)
    parts.push(`Ongoing Projects:\n${note.ongoingProjects}`);
  if (note.tipsAndAdvice) parts.push(`Tips & Advice:\n${note.tipsAndAdvice}`);
  if (note.importantContacts)
    parts.push(`Important Contacts:\n${note.importantContacts}`);
  if (note.filesAndResources)
    parts.push(`Files & Resources:\n${note.filesAndResources}`);
  return parts.join("\n\n");
}

/**
 * Distill every handoff note written for a position into a skimmable set of
 * bullets — the point being that an incoming board member can read years of
 * accumulated advice in a couple of minutes instead of opening five documents.
 *
 * Deduplication is the real work here: the same advice ("order carnival
 * supplies by February") shows up in note after note, and repetition is signal,
 * not noise, so repeated points are merged and flagged as recurring.
 */
export async function summarizeHandoffNotes(
  context: SummarizeContext
): Promise<HandoffSummaryContent> {
  const positionLabel =
    context.positionLabel ?? fallbackPositionLabel(context.position);
  const years = context.notes.map((n) => n.schoolYear);

  const systemPrompt = `You are distilling several years of PTA handoff notes for the ${positionLabel} role into a single skimmable briefing for the incoming board member.

Your job is DEDUPLICATION and SYNTHESIS, not summarization of each note in turn.

GUIDELINES:
- Merge points that say the same thing across different years into ONE bullet. When multiple years make the same point, that repetition is important signal — mark it recurring and list every year that mentioned it.
- Keep specifics: dollar amounts, dates, deadlines, vendor names, phone numbers, tool names. A bullet that loses the specifics is useless.
- Each bullet should be one sentence, scannable, and written as guidance to the incoming person ("Order carnival supplies by February — they sell out").
- Drop pure pleasantries, thank-yous, and one-off status updates that no longer apply.
- Prefer newer information when years contradict each other, but say so: "Book fair moved from October to March as of 2025-2026".
- Do NOT invent anything that isn't in the notes.
- Aim for 3-8 bullets per section. Omit a section entirely (empty bullets array) if the notes say nothing about it.

The "years" field on each bullet must contain school year strings exactly as they appear in the notes. Available years: ${years.join(", ")}.

Each section "title" must be one of: ${SECTION_TITLES.join(" | ")}. Include the sections in the order listed above.`;

  const userPrompt = `Here are all the handoff notes written by past ${positionLabel}s${context.schoolName ? ` at ${context.schoolName}` : ""}, newest first:

${context.notes.map(formatNoteForPrompt).join("\n\n")}

Distill these into the bullet briefing described above.`;

  const parsed = await generateStructuredJson<HandoffSummaryContent>({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 8192,
    schema: {
      type: "object",
      properties: {
        overview: {
          type: "string",
          description:
            "2-3 sentence orientation to what this role actually involves, drawn from the notes.",
        },
        sections: {
          type: "array",
          description:
            "One section per title above, in order. Omit a section entirely if the notes say nothing about it.",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                enum: [...SECTION_TITLES],
              },
              bullets: {
                type: "array",
                description: "3-8 deduplicated, synthesized bullets.",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    years: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "The school years that made this point, exactly as they appear in the notes.",
                    },
                    recurring: { type: "boolean" },
                  },
                  required: ["text", "years", "recurring"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "bullets"],
            additionalProperties: false,
          },
        },
      },
      required: ["overview", "sections"],
      additionalProperties: false,
    },
  });

  const knownYears = new Set(years);

  return {
    overview: parsed.overview || "",
    sections: (parsed.sections || [])
      .map((section) => ({
        title: section.title || "Notes",
        bullets: (section.bullets || [])
          .filter((bullet) => bullet?.text)
          .map((bullet) => {
            // Trust the model's text, but not its citations — a hallucinated
            // year shown next to a bullet quietly undermines the whole thing.
            const citedYears = (bullet.years || []).filter((year) =>
              knownYears.has(year)
            );
            return {
              text: bullet.text,
              years: citedYears,
              recurring: citedYears.length > 1,
            };
          }),
      }))
      .filter((section) => section.bullets.length > 0),
  };
}
