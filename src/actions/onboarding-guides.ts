"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertPtaBoardMember,
  assertPtaBoard,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  onboardingGuides,
  boardHandoffNotes,
  knowledgeArticles,
  schools,
} from "@/lib/db/schema";
import { eq, and, desc, ilike, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { PtaBoardPosition, OnboardingGuide } from "@/types";
import {
  getBoardPositionLabel,
  getBoardPositionDescription,
} from "@/lib/board-positions";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { anthropic, DEFAULT_MODEL } from "@/lib/ai/client";
import { documentUrl } from "@/lib/documents/index-document";

export interface SourceUsed {
  type: "knowledge_article" | "drive_file" | "indexed_file" | "handoff_note";
  title: string;
  url?: string;
}

export interface OnboardingGuideContent {
  overview: string;
  keyResponsibilities: string[];
  firstWeekChecklist: string[];
  monthlyCalendar: { month: string; tasks: string[] }[];
  importantContacts: string[];
  tipsFromPredecessors: string[];
  resources: { title: string; url?: string; description: string }[];
  summary: string;
}

/**
 * A "generating" row older than this is treated as dead — its background work
 * was almost certainly killed by a deploy, crash, or the function hitting its
 * duration limit. Comfortably above the route's maxDuration (300s) so a slow
 * but healthy run is never mistaken for a stuck one.
 */
const GUIDE_GENERATION_STALE_MS = 8 * 60 * 1000;

export type GuideGenerationStatus =
  | "generating"
  | "ready"
  | "failed"
  | "none";

type GuideRow = typeof onboardingGuides.$inferSelect;

function isStaleGeneration(guide: Pick<GuideRow, "status" | "generationStartedAt">): boolean {
  if (guide.status !== "generating") return false;
  const startedAt = guide.generationStartedAt?.getTime();
  // A "generating" row with no start time predates this column or was written
  // by a killed run — either way there's nothing to wait on.
  if (!startedAt) return true;
  return Date.now() - startedAt > GUIDE_GENERATION_STALE_MS;
}

/**
 * The status the UI should act on. Collapses a stale "generating" run back to a
 * terminal state: a stale regenerate that still has content falls back to the
 * previous guide ("ready"), a stale first-time run becomes "failed".
 */
function effectiveGuideStatus(
  guide: Pick<GuideRow, "status" | "generationStartedAt" | "content"> | null | undefined
): GuideGenerationStatus {
  if (!guide) return "none";
  if (guide.status === "generating") {
    if (isStaleGeneration(guide)) return guide.content ? "ready" : "failed";
    return "generating";
  }
  return guide.status === "ready" ? "ready" : "failed";
}

/**
 * Schema handed to the model via `output_config.format`. The API constrains
 * generation to this shape, so the response is always parseable JSON — the old
 * "return ONLY JSON" + `JSON.parse` approach failed whenever the model emitted a
 * raw newline inside a string literal ("Bad control character in string literal").
 *
 * Structured outputs don't support array length constraints, so counts live in
 * the field descriptions. `url` is required-but-may-be-empty for the same reason
 * (every property must be listed in `required`); empty strings are dropped below.
 */
const GUIDE_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "A warm 1-2 sentence welcome that names the single most important thing this person should know.",
    },
    overview: {
      type: "string",
      description:
        "2-3 paragraphs on what this role actually involves at this school, including the realistic time commitment and the busiest stretches of the year. Use \\n\\n between paragraphs.",
    },
    keyResponsibilities: {
      type: "array",
      items: { type: "string" },
      description:
        "5-8 responsibilities. Each one a concrete action, not a category — 'Reconcile the checking account monthly and present a written report at the board meeting', not 'Finances'.",
    },
    firstWeekChecklist: {
      type: "array",
      items: { type: "string" },
      description:
        "5-7 things to do in the first week, ordered so each one unblocks the next. Name the specific system, document, or person where the context provides it.",
    },
    monthlyCalendar: {
      type: "array",
      items: {
        type: "object",
        properties: {
          month: {
            type: "string",
            description: "Month name, e.g. 'August'.",
          },
          tasks: {
            type: "array",
            items: { type: "string" },
            description: "1-4 tasks that are actually due in this month.",
          },
        },
        required: ["month", "tasks"],
        additionalProperties: false,
      },
      description:
        "One entry per month of the school year, August through May, in order.",
    },
    importantContacts: {
      type: "array",
      items: { type: "string" },
      description:
        "People or roles to connect with, each with a short note on why. Use real names ONLY when they appear in the provided context; otherwise use the role title.",
    },
    tipsFromPredecessors: {
      type: "array",
      items: { type: "string" },
      description:
        "3-5 tips. Prefer specific advice lifted from the handoff notes over generic encouragement. If a tip comes from a predecessor, attribute it (e.g. 'Per last year's handoff: ...').",
    },
    resources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: {
            type: "string",
            description:
              "The resource's URL if one appears in the provided context. Use an empty string if you do not have a real URL — never invent one.",
          },
          description: {
            type: "string",
            description: "One sentence on what it is and when they'll need it.",
          },
        },
        required: ["title", "url", "description"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "summary",
    "overview",
    "keyResponsibilities",
    "firstWeekChecklist",
    "monthlyCalendar",
    "importantContacts",
    "tipsFromPredecessors",
    "resources",
  ],
  additionalProperties: false,
} as const;

/**
 * Baseline duties per board position. Previously only four positions had this,
 * so the other six (including Room Parent VP) were generated with no role
 * grounding at all and came out noticeably vaguer.
 *
 * Keyed by the standard slugs only. A school-defined position is grounded by
 * the description the school wrote on it instead — see runGuideGeneration.
 */
const ROLE_CONTEXT: Record<string, string> = {
  president: `- Leading PTA meetings and setting agendas
- Coordinating with school administration
- Overseeing committee chairs and board members
- Representing the PTA in the community and at council/district meetings
- Strategic planning and budget approval for the school year`,
  president_elect: `- Shadowing the current President and learning the role before taking over
- Taking on specific projects to build experience
- Attending training offered by the district or state PTA
- Building relationships with the board, staff, and community partners
- Preparing the transition plan for next year`,
  vice_president: `- Standing in for the President at meetings and events when needed
- Overseeing assigned committees and supporting their chairs
- Helping recruit and onboard volunteers
- Taking point on specific initiatives delegated by the President`,
  vp_elect: `- Shadowing the current VP and learning the role before taking over
- Supporting committees to build familiarity with how events run
- Attending training offered by the district or state PTA
- Preparing for the VP transition`,
  secretary: `- Taking and distributing meeting minutes
- Maintaining official PTA records and the document archive
- Managing correspondence and meeting notices
- Keeping membership and attendance records
- Supporting the President with administrative tasks`,
  treasurer: `- Managing the PTA budget and financial records
- Processing reimbursements and payments
- Presenting financial reports at every board meeting
- Working with the bank, maintaining accounts, and handling signers
- Ensuring compliance with PTA financial guidelines, audits, and tax filings`,
  legislative_vp: `- Tracking legislation and policy that affects the school
- Sharing advocacy alerts and action items with families
- Representing the PTA at district or state advocacy events
- Educating the board and community on how policy decisions affect students`,
  public_relations_vp: `- Running PTA communications: newsletter, social media, and website
- Publicizing events and driving attendance
- Maintaining a consistent voice and branding across channels
- Coordinating with the school on what can and can't be shared publicly`,
  membership_vp: `- Running membership campaigns and drives
- Tracking membership numbers against goals
- Managing member communications and welcome outreach
- Reporting membership status at meetings`,
  room_parent_vp: `- Recruiting and assigning a room parent for every classroom
- Onboarding room parents and being their point of contact all year
- Coordinating classroom parties, teacher appreciation, and classroom volunteer needs
- Acting as the bridge between teachers, room parents, and the PTA board
- Communicating deadlines and expectations to room parents throughout the year`,
};

/**
 * Build a Postgres `to_tsquery` expression from position keywords.
 *
 * Multi-word keywords ("room parent", "vice president") are NOT valid tsquery
 * input — passing them raw made `to_tsquery` throw, which the caller swallowed,
 * so document search silently returned nothing for those positions. Phrases
 * become `<->` (adjacency) expressions instead.
 */
function buildTsQuery(keywords: string[]): string | null {
  const terms = keywords
    .map((keyword) =>
      keyword
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .join(" <-> ")
    )
    .filter(Boolean);

  return terms.length > 0 ? terms.join(" | ") : null;
}

/**
 * Get the guide for the current user's position
 */
export async function getMyGuide(): Promise<{
  guide: OnboardingGuide | null;
  content: OnboardingGuideContent | null;
  sourcesUsed: SourceUsed[];
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertPtaBoard(user.id!);

  const membership = await getSchoolMembership(user.id!, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;

  if (!position) {
    return { guide: null, content: null, sourcesUsed: [] };
  }

  const guide = await db.query.onboardingGuides.findFirst({
    where: and(
      eq(onboardingGuides.schoolId, schoolId),
      eq(onboardingGuides.position, position),
      eq(onboardingGuides.schoolYear, schoolYear)
    ),
  });

  // Collapse a stale "generating" run to its effective terminal state so a page
  // load doesn't get trapped on the spinner if the background work was killed.
  if (guide && isStaleGeneration(guide)) {
    guide.status = guide.content ? "ready" : "failed";
  }

  if (!guide || guide.status !== "ready" || !guide.content) {
    return { guide: guide || null, content: null, sourcesUsed: [] };
  }

  let content: OnboardingGuideContent | null = null;
  let sourcesUsed: SourceUsed[] = [];

  try {
    content = JSON.parse(guide.content) as OnboardingGuideContent;
    if (guide.sourcesUsed) {
      sourcesUsed = JSON.parse(guide.sourcesUsed) as SourceUsed[];
    }
  } catch {
    // Invalid JSON, return null content
  }

  return { guide, content, sourcesUsed };
}

/**
 * Lightweight poll endpoint for the in-progress UI. Returns only the effective
 * status for the current user's own guide — no heavy content payload — so the
 * client can poll it cheaply every few seconds.
 */
export async function getGuideGenerationStatus(): Promise<{
  status: GuideGenerationStatus;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return { status: "none" };
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertPtaBoard(user.id!);

  const membership = await getSchoolMembership(user.id!, schoolId);
  const position = membership?.boardPosition as PtaBoardPosition | undefined;
  if (!position) return { status: "none" };

  const guide = await db.query.onboardingGuides.findFirst({
    where: and(
      eq(onboardingGuides.schoolId, schoolId),
      eq(onboardingGuides.position, position),
      eq(onboardingGuides.schoolYear, schoolYear)
    ),
    columns: { status: true, generationStartedAt: true, content: true },
  });

  return { status: effectiveGuideStatus(guide) };
}

/**
 * Get a guide by ID
 */
export async function getGuide(guideId: string): Promise<{
  guide: OnboardingGuide | null;
  content: OnboardingGuideContent | null;
  sourcesUsed: SourceUsed[];
}> {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const guide = await db.query.onboardingGuides.findFirst({
    where: and(
      eq(onboardingGuides.id, guideId),
      eq(onboardingGuides.schoolId, schoolId)
    ),
  });

  if (!guide || guide.status !== "ready" || !guide.content) {
    return { guide: guide || null, content: null, sourcesUsed: [] };
  }

  let content: OnboardingGuideContent | null = null;
  let sourcesUsed: SourceUsed[] = [];

  try {
    content = JSON.parse(guide.content) as OnboardingGuideContent;
    if (guide.sourcesUsed) {
      sourcesUsed = JSON.parse(guide.sourcesUsed) as SourceUsed[];
    }
  } catch {
    // Invalid JSON
  }

  return { guide, content, sourcesUsed };
}

/**
 * Kick off guide generation and return immediately.
 *
 * The row is flipped to "generating" synchronously so the page can render the
 * in-progress state and poll; the expensive model call runs in the background
 * via `after()`. This keeps the user's request short (no more 60s+ blocking
 * action that trips Vercel's function timeout) while the work continues up to
 * the route's maxDuration.
 */
export async function startGuideGeneration(
  position: PtaBoardPosition
): Promise<{ success: boolean; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertPtaBoardMember(user.id!, schoolId);

  // If a run is already in progress and hasn't gone stale, don't start another
  // — avoids duplicate model calls when a board member double-clicks or two
  // people regenerate the same guide at once.
  const existing = await db.query.onboardingGuides.findFirst({
    where: and(
      eq(onboardingGuides.schoolId, schoolId),
      eq(onboardingGuides.position, position),
      eq(onboardingGuides.schoolYear, schoolYear)
    ),
  });
  if (
    existing &&
    existing.status === "generating" &&
    !isStaleGeneration(existing)
  ) {
    return { success: true };
  }

  // On a regenerate we deliberately leave content/sourcesUsed/generatedAt
  // untouched, so a failed run can fall back to the previous guide (see
  // runGuideGeneration's catch).
  const startedAt = new Date();
  await db
    .insert(onboardingGuides)
    .values({
      schoolId,
      position,
      schoolYear,
      status: "generating",
      generationStartedAt: startedAt,
      generatedBy: user.id,
    })
    .onConflictDoUpdate({
      target: [
        onboardingGuides.schoolId,
        onboardingGuides.position,
        onboardingGuides.schoolYear,
      ],
      set: { status: "generating", generationStartedAt: startedAt },
    });

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/guide");

  after(() =>
    runGuideGeneration({ schoolId, position, schoolYear, userId: user.id! })
  );

  return { success: true };
}

/**
 * Does the heavy lifting: gathers context from handoff notes, knowledge base,
 * and Drive files, calls the model, and writes the result.
 *
 * Runs in the background via `after()`, so it must not assume an open request —
 * authorization is already enforced by startGuideGeneration. It never throws to
 * a caller: on failure it records a terminal status and preserves any existing
 * guide.
 */
async function runGuideGeneration({
  schoolId,
  position,
  schoolYear,
  userId,
}: {
  schoolId: string;
  position: PtaBoardPosition;
  schoolYear: string;
  userId: string;
}): Promise<void> {
  // Positions are school-defined, so both the display name and the baseline
  // duties come from the school's own row when it has one.
  const [positionLabel, positionDescription] = await Promise.all([
    getBoardPositionLabel(schoolId, position),
    getBoardPositionDescription(schoolId, position),
  ]);
  const sourcesUsed: SourceUsed[] = [];

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { name: true },
  });

  try {
    // 1. Gather handoff notes from predecessors (last 3 years).
    //    A year can hold several notes now, so the cutoff is by school YEAR
    //    rather than by row — otherwise three notes from one busy year would
    //    crowd out the other two years entirely.
    const allHandoffNotes = await db.query.boardHandoffNotes.findMany({
      where: and(
        eq(boardHandoffNotes.schoolId, schoolId),
        eq(boardHandoffNotes.position, position),
        isNull(boardHandoffNotes.archivedAt)
      ),
      with: {
        fromUser: { columns: { name: true } },
      },
      orderBy: [
        desc(boardHandoffNotes.schoolYear),
        desc(boardHandoffNotes.updatedAt),
      ],
    });

    const recentYears = new Set(
      [...new Set(allHandoffNotes.map((note) => note.schoolYear))].slice(0, 3)
    );
    const handoffNotes = allHandoffNotes.filter((note) =>
      recentYears.has(note.schoolYear)
    );

    let handoffContext = "";
    for (const note of handoffNotes) {
      const fromName = note.fromUser?.name || "Previous member";
      handoffContext += `\n--- Handoff Note from ${fromName} (${note.schoolYear}) ---\n`;
      if (note.keyAccomplishments)
        handoffContext += `Key Accomplishments:\n${note.keyAccomplishments}\n\n`;
      if (note.ongoingProjects)
        handoffContext += `Ongoing Projects:\n${note.ongoingProjects}\n\n`;
      if (note.tipsAndAdvice)
        handoffContext += `Tips & Advice:\n${note.tipsAndAdvice}\n\n`;
      if (note.importantContacts)
        handoffContext += `Important Contacts:\n${note.importantContacts}\n\n`;
      if (note.filesAndResources)
        handoffContext += `Resources:\n${note.filesAndResources}\n\n`;

      sourcesUsed.push({
        type: "handoff_note",
        title: `Handoff from ${fromName} (${note.schoolYear})`,
      });
    }

    // 2. Find relevant knowledge base articles
    const positionKeywords = getPositionKeywords(position, positionLabel);
    const searchCondition =
      positionKeywords.length > 0
        ? or(
            ...positionKeywords.map((kw) =>
              ilike(knowledgeArticles.title, `%${kw}%`)
            ),
            ...positionKeywords.map((kw) =>
              ilike(knowledgeArticles.category, `%${kw}%`)
            )
          )
        : undefined;

    const articles = await db.query.knowledgeArticles.findMany({
      where: searchCondition
        ? and(eq(knowledgeArticles.schoolId, schoolId), searchCondition)
        : eq(knowledgeArticles.schoolId, schoolId),
      limit: 8,
    });

    let articleContext = "";
    for (const article of articles) {
      articleContext += `\n--- Knowledge Article: ${article.title} ---\n`;
      articleContext += `Category: ${article.category || "General"}\n`;
      articleContext += `Summary: ${article.summary || "No summary"}\n`;
      if (article.body) {
        const truncated =
          article.body.length > 2000
            ? article.body.slice(0, 2000) + "\n[truncated]"
            : article.body;
        articleContext += `Content:\n${truncated}\n`;
      }

      sourcesUsed.push({
        type: "knowledge_article",
        title: article.title,
        url: article.googleDriveUrl || undefined,
      });
    }

    // 3. Search the document index for role-specific content. This covers
    //    Drive-synced files as well as documents uploaded directly to DragonHub.
    let driveContext = "";
    try {
      const searchQuery = buildTsQuery(positionKeywords);
      if (searchQuery) {
        const indexedFiles = await db.execute<{
          id: string;
          file_id: string;
          file_name: string;
          display_name: string;
          text_content: string | null;
          source: string;
          blob_url: string | null;
          web_url: string | null;
        }>(sql`
          SELECT
            dfi.id,
            dfi.file_id,
            dfi.file_name,
            coalesce(dfi.title, dfi.file_name) as display_name,
            dfi.text_content,
            dfi.source,
            dfi.blob_url,
            dfi.web_url
          FROM drive_file_index dfi
          WHERE dfi.school_id = ${schoolId}
            AND dfi.search_vector @@ to_tsquery('english', ${searchQuery})
          ORDER BY ts_rank(dfi.search_vector, to_tsquery('english', ${searchQuery})) DESC
          LIMIT 5
        `);

        for (const file of indexedFiles.rows) {
          if (file.text_content) {
            const truncated =
              file.text_content.length > 3000
                ? file.text_content.slice(0, 3000) + "\n[truncated]"
                : file.text_content;
            driveContext += `\n--- Document: ${file.display_name} ---\n${truncated}\n`;
          }

          sourcesUsed.push({
            type: "indexed_file",
            title: file.display_name,
            url: documentUrl(file),
          });
        }
      }
    } catch (error) {
      console.error("Document index search failed:", error);
    }

    // 4. Baseline duties for this position. Standard positions have a curated
    //    list; a school-defined one is grounded by the description the school
    //    wrote for it, so a "Teacher Representative" guide isn't generated with
    //    no idea what the role does.
    const roleSpecificContext =
      ROLE_CONTEXT[position] ??
      (positionDescription ? `- ${positionDescription}` : "");

    // 5. Generate the guide using AI
    const schoolName = school?.name || "the school";
    const hasSchoolContext = Boolean(
      handoffContext || articleContext || driveContext
    );

    const systemPrompt = `You are an experienced PTA board member writing an onboarding guide for the incoming ${positionLabel} at ${schoolName}, an elementary school PTA. The reader is a parent volunteer who has never held this role and needs to get up to speed fast.

HOW TO WRITE THIS GUIDE:
- Ground every specific claim in the CONTEXT below. Names, dates, dollar amounts, vendors, logins, event titles, and links must come from the context — never invent them.
- Where the context is silent, fall back to standard PTA best practice and keep it general rather than inventing school-specific detail. Do not manufacture a name or a URL to fill a slot.
- Prefer specific over generic. "Ask the Treasurer for the reimbursement form" beats "coordinate with the board."
- Write for someone who is volunteering around a job and family. Be realistic about time commitment and call out the busiest weeks.
- Tone: warm, direct, encouraging. Second person ("you"). No corporate filler, no emoji.
- The school year runs August through May. Anchor the monthly calendar to the ${schoolYear} school year.${
      hasSchoolContext
        ? "\n- The context below is real material from this school. Lean on it heavily — it is what makes this guide worth more than a generic template."
        : "\n- There is no school-specific material available for this role yet, so write the strongest general guide you can and keep school-specific placeholders out of it."
    }`;

    const contextSections = [
      roleSpecificContext
        ? `TYPICAL DUTIES FOR THIS ROLE:\n${roleSpecificContext}`
        : "",
      handoffContext
        ? `HANDOFF NOTES FROM PREDECESSORS (highest-value source — mine these for specifics):\n${handoffContext}`
        : "No handoff notes from previous position holders are available.",
      articleContext ? `KNOWLEDGE BASE ARTICLES:\n${articleContext}` : "",
      driveContext ? `SCHOOL DOCUMENTS:\n${driveContext}` : "",
    ].filter(Boolean);

    const message = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      // Thinking tokens count against max_tokens, so this is well above what
      // the guide itself needs (~1.5-2k) to leave the model room to reason.
      max_tokens: 16000,
      // Synthesizing a year-long guide from handoff notes, articles, and
      // documents is exactly the kind of multi-source reasoning that benefits
      // from thinking. `omitted` because we never surface the reasoning.
      thinking: { type: "adaptive", display: "omitted" },
      system: systemPrompt,
      output_config: {
        effort: "high",
        // Constrains generation to the guide shape. Without this the model
        // returned prose-wrapped JSON that intermittently failed to parse.
        format: { type: "json_schema", schema: GUIDE_JSON_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Write the onboarding guide for the incoming ${positionLabel} at ${schoolName} for the ${schoolYear} school year.

CONTEXT
=======
${contextSections.join("\n\n")}`,
        },
      ],
    });

    if (message.stop_reason === "max_tokens") {
      throw new Error("Model response was truncated before the guide finished");
    }

    const text = message.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("Model returned no text content");
    }

    const parsed = JSON.parse(text.text) as OnboardingGuideContent;

    // Drop the empty-string URLs the schema requires the model to emit when it
    // doesn't have a real link, so the UI doesn't render dead "link" anchors.
    const content: OnboardingGuideContent = {
      ...parsed,
      resources: (parsed.resources ?? []).map((resource) => ({
        ...resource,
        url: resource.url?.trim() ? resource.url.trim() : undefined,
      })),
    };

    await db
      .insert(onboardingGuides)
      .values({
        schoolId,
        position,
        schoolYear,
        status: "ready",
        content: JSON.stringify(content),
        sourcesUsed: JSON.stringify(sourcesUsed),
        generatedAt: new Date(),
        generatedBy: userId,
        generationStartedAt: null,
      })
      .onConflictDoUpdate({
        target: [
          onboardingGuides.schoolId,
          onboardingGuides.position,
          onboardingGuides.schoolYear,
        ],
        set: {
          status: "ready",
          content: JSON.stringify(content),
          sourcesUsed: JSON.stringify(sourcesUsed),
          generatedAt: new Date(),
          generatedBy: userId,
          generationStartedAt: null,
        },
      });

    revalidatePath("/onboarding");
    revalidatePath("/onboarding/guide");
  } catch (error) {
    // Log the real error for debugging. Preserve a previously-good guide: if
    // this row already has content (a regenerate that failed), revert to
    // "ready" and keep it; otherwise mark "failed" so the UI shows the
    // generator again. Either way clear generationStartedAt so the row is no
    // longer treated as an in-progress run.
    console.error("Guide generation failed:", error);

    const existing = await db.query.onboardingGuides.findFirst({
      where: and(
        eq(onboardingGuides.schoolId, schoolId),
        eq(onboardingGuides.position, position),
        eq(onboardingGuides.schoolYear, schoolYear)
      ),
      columns: { content: true },
    });

    await db
      .update(onboardingGuides)
      .set({
        status: existing?.content ? "ready" : "failed",
        generationStartedAt: null,
      })
      .where(
        and(
          eq(onboardingGuides.schoolId, schoolId),
          eq(onboardingGuides.position, position),
          eq(onboardingGuides.schoolYear, schoolYear)
        )
      );

    revalidatePath("/onboarding");
    revalidatePath("/onboarding/guide");
  }
}

/**
 * Publish guide content as a knowledge article
 */
export async function publishGuideAsArticle(
  guideId: string
): Promise<{ success: boolean; articleId?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const guide = await db.query.onboardingGuides.findFirst({
    where: and(
      eq(onboardingGuides.id, guideId),
      eq(onboardingGuides.schoolId, schoolId)
    ),
  });

  if (!guide || guide.status !== "ready" || !guide.content) {
    throw new Error("Guide not ready for publishing");
  }

  const content = JSON.parse(guide.content) as OnboardingGuideContent;
  const positionLabel = await getBoardPositionLabel(schoolId, guide.position);

  // Format content for article
  const articleContent = `
# ${positionLabel} Onboarding Guide

${content.overview}

## Key Responsibilities

${content.keyResponsibilities.map((r) => `- ${r}`).join("\n")}

## First Week Checklist

${content.firstWeekChecklist.map((t) => `- [ ] ${t}`).join("\n")}

## Monthly Calendar

${content.monthlyCalendar.map((m) => `### ${m.month}\n${m.tasks.map((t) => `- ${t}`).join("\n")}`).join("\n\n")}

## Important Contacts

${content.importantContacts.map((c) => `- ${c}`).join("\n")}

## Tips

${content.tipsFromPredecessors.map((t) => `- ${t}`).join("\n")}

## Resources

${content.resources.map((r) => `- **${r.title}**${r.url ? ` ([link](${r.url}))` : ""}: ${r.description}`).join("\n")}
`.trim();

  // Check if article already exists
  if (guide.knowledgeArticleId) {
    // Update existing article
    await db
      .update(knowledgeArticles)
      .set({
        body: articleContent,
        summary: content.summary,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeArticles.id, guide.knowledgeArticleId));

    return { success: true, articleId: guide.knowledgeArticleId };
  }

  // Create new article
  const slug = `${guide.position}-onboarding-guide-${guide.schoolYear}`.replace(
    /_/g,
    "-"
  );

  const [article] = await db
    .insert(knowledgeArticles)
    .values({
      schoolId,
      title: `${positionLabel} Onboarding Guide (${guide.schoolYear})`,
      slug,
      category: "Onboarding",
      summary: content.summary,
      body: articleContent,
      createdBy: user.id,
    })
    .returning();

  // Link article to guide
  await db
    .update(onboardingGuides)
    .set({ knowledgeArticleId: article.id })
    .where(eq(onboardingGuides.id, guideId));

  revalidatePath("/knowledge");
  revalidatePath("/onboarding/guide");
  return { success: true, articleId: article.id };
}

/**
 * Get all guides for admin view
 */
export async function getAllGuides() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  return db.query.onboardingGuides.findMany({
    where: eq(onboardingGuides.schoolId, schoolId),
    with: {
      generator: { columns: { name: true, email: true } },
    },
    orderBy: [desc(onboardingGuides.schoolYear), desc(onboardingGuides.position)],
  });
}

/**
 * Delete a guide
 */
export async function deleteGuide(guideId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  await db
    .delete(onboardingGuides)
    .where(
      and(
        eq(onboardingGuides.id, guideId),
        eq(onboardingGuides.schoolId, schoolId)
      )
    );

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/guide");
  revalidatePath("/admin/board/onboarding");
  return { success: true };
}

/**
 * Keywords for position-specific document search.
 *
 * Only the standard slate has a curated list. A school-defined position
 * ("Teacher Representative") falls back to the words in its own label, which is
 * a weaker signal than a hand-tuned list but far better than searching for
 * nothing — which is what an unmapped position used to get.
 */
function getPositionKeywords(
  position: PtaBoardPosition,
  label?: string
): string[] {
  const keywordMap: Record<string, string[]> = {
    president: ["president", "leadership", "meeting", "agenda", "board"],
    vice_president: ["vice president", "vp", "support", "committee"],
    secretary: ["secretary", "minutes", "records", "correspondence"],
    treasurer: ["treasurer", "budget", "finance", "money", "payment", "reimbursement"],
    president_elect: ["president elect", "training", "transition"],
    vp_elect: ["vp elect", "training", "transition"],
    legislative_vp: ["legislative", "advocacy", "policy", "government"],
    public_relations_vp: ["public relations", "pr", "communication", "social media", "newsletter"],
    membership_vp: ["membership", "members", "recruitment", "drive"],
    room_parent_vp: ["room parent", "classroom", "volunteers", "teachers"],
  };

  const mapped = keywordMap[position];
  if (mapped) return mapped;

  // Derive from the label: "Teacher Representative" → ["teacher representative",
  // "teacher", "representative"]. Drop stopwords so "VP of Hospitality" doesn't
  // search for "of".
  const source = (label ?? position.replace(/_/g, " ")).toLowerCase();
  const words = source
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "for", "of"].includes(w));

  return [...new Set([source.trim(), ...words])].filter(Boolean);
}
