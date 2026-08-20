import { generateStructuredJson } from "./structured";
import type { EmailAudience } from "@/types";

/**
 * A second pair of eyes on a finished draft.
 *
 * Deliberately *not* the generator. `generateWeeklyEmail` writes the email;
 * this reads one the secretary wrote and says what would make it easier to
 * skim on a phone at 7am. It never returns replacement copy for a whole
 * section — a rewrite button is how a careful writer's voice gets flattened,
 * and the whole reason she stopped trusting the regenerate path.
 *
 * Haiku on purpose. Readability review is a cheap, high-volume, low-judgment
 * task run on every draft; spending Sonnet on it buys nothing a parent would
 * notice. Note that Haiku 4.5 predates `output_config.effort`, so this must
 * not pass `effort` — `generateStructuredJson` omits it unless asked.
 */
const REVIEW_MODEL = "claude-haiku-4-5";

export interface EmailReviewNote {
  /** Index into the sections array, or null for a whole-email observation. */
  sectionIndex: number | null;
  sectionTitle: string | null;
  severity: "high" | "medium" | "low";
  issue: string;
  suggestion: string;
}

export interface EmailReviewResult {
  /** One or two sentences on how the email reads overall. */
  summary: string;
  /** 1-5, where 5 is "a parent could skim this in thirty seconds". */
  readabilityScore: number;
  /** What the draft already does well — worth saying, so it stays that way. */
  strengths: string[];
  notes: EmailReviewNote[];
}

export interface ReviewSectionContext {
  title: string;
  /** HTML from the editor; the prompt says so, so tags aren't flagged as typos. */
  body: string;
  linkUrl?: string;
  linkText?: string;
  hasImage: boolean;
  audience: EmailAudience;
}

export interface ReviewEmailContext {
  schoolName: string;
  title: string;
  weekLabel: string;
  headerText: string;
  sections: ReviewSectionContext[];
}

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "readabilityScore", "strengths", "notes"],
  properties: {
    summary: {
      type: "string",
      description:
        "One or two sentences on how the whole email reads. Plain, specific, no praise padding.",
    },
    readabilityScore: {
      type: "integer",
      minimum: 1,
      maximum: 5,
      description:
        "5 = a busy parent could skim this in thirty seconds and know what to do.",
    },
    strengths: {
      type: "array",
      maxItems: 3,
      items: { type: "string" },
      description: "What this draft already does well. Omit rather than invent.",
    },
    notes: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "sectionIndex",
          "sectionTitle",
          "severity",
          "issue",
          "suggestion",
        ],
        properties: {
          sectionIndex: {
            type: ["integer", "null"],
            description:
              "0-based index of the section, or null for a whole-email note.",
          },
          sectionTitle: { type: ["string", "null"] },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          issue: {
            type: "string",
            description: "What makes this hard to read, in one sentence.",
          },
          suggestion: {
            type: "string",
            description:
              "The concrete change to make. A rewritten sentence or headline is fine; a rewritten section is not.",
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are proofreading a PTA's weekly email to families before a volunteer secretary sends it.

Your job is readability, not rewriting. The secretary wrote this and her voice is the point — you suggest, she decides.

What matters, in order:
1. **Skimmability.** Most parents read this on a phone between other things. Long paragraphs, buried dates, and headlines that don't say what the thing is are the top problems.
2. **The ask is clear.** Every section that wants something — sign up, bring a snack, show up at 6 — should say so plainly, with the date and the link.
3. **Specifics beat enthusiasm.** "Join us for a fun evening!" tells a parent nothing. Dates, times, places, and who it's for do.
4. **Length.** Flag a section that has grown past what it needs to say.
5. **Consistency.** Dates written three different ways, inconsistent capitalization in headlines, a link labelled "click here".

Rules:
- Bodies arrive as HTML from a rich text editor. Ignore the markup; never flag tags as errors.
- Point at real text in the draft. Never invent a fact, a date, or an event that isn't there.
- If a section reads well, say nothing about it. A short, honest review beats a padded one.
- Suggestions are surgical: a sharper headline, a sentence split in two, a date moved to the front. Never hand back a whole rewritten section.
- If the email is in good shape, say so and return few or no notes.`;

export async function reviewEmailDraft(
  context: ReviewEmailContext
): Promise<EmailReviewResult> {
  const sectionsText = context.sections
    .map((section, index) => {
      const parts = [
        `--- Section ${index} ---`,
        `Title: ${section.title || "(no title)"}`,
        `Audience: ${
          section.audience === "pta_only" ? "PTA members only" : "Whole school"
        }`,
        `Has image: ${section.hasImage ? "yes" : "no"}`,
        `Body (HTML): ${section.body || "(empty)"}`,
      ];
      if (section.linkUrl) {
        parts.push(`Link: "${section.linkText || "(no label)"}" -> ${section.linkUrl}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");

  return generateStructuredJson<EmailReviewResult>({
    model: REVIEW_MODEL,
    system: SYSTEM_PROMPT,
    schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 3000,
    prompt: `School: ${context.schoolName}
Email subject: ${context.title}
Week covered: ${context.weekLabel}

Header (appears above the first section):
${context.headerText || "(none)"}

${context.sections.length} section(s):

${sectionsText}

Review this draft for readability and return your notes.`,
  });
}
