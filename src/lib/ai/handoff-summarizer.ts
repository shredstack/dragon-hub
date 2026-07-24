import { anthropic, DEFAULT_MODEL } from "./client";
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

OUTPUT FORMAT:
Return valid JSON matching this shape:
{
  "overview": "2-3 sentence orientation to what this role actually involves, drawn from the notes",
  "sections": [
    {
      "title": "one of: ${SECTION_TITLES.join(" | ")}",
      "bullets": [
        { "text": "the point", "years": ["2024-2025"], "recurring": false }
      ]
    }
  ]
}

Include the sections in the order listed above. Return ONLY valid JSON, no other text.`;

  const userPrompt = `Here are all the handoff notes written by past ${positionLabel}s${context.schoolName ? ` at ${context.schoolName}` : ""}, newest first:

${context.notes.map(formatNoteForPrompt).join("\n\n")}

Distill these into the bullet briefing described above.`;

  const message = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 8192,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: userPrompt }],
    system: systemPrompt,
  });

  const textContent = message.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in AI response");
  }

  let responseText = textContent.text.trim();
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
    const parsed = JSON.parse(responseText) as HandoffSummaryContent;
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
  } catch (parseError) {
    console.error("Failed to parse handoff summary response:", parseError);
    console.error("Response text:", responseText);
    throw new Error("Failed to parse AI-generated handoff summary");
  }
}
