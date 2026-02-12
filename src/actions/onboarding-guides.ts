"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
  assertPtaBoard,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  onboardingGuides,
  boardHandoffNotes,
  knowledgeArticles,
} from "@/lib/db/schema";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PtaBoardPosition, OnboardingGuide } from "@/types";
import { CURRENT_SCHOOL_YEAR, PTA_BOARD_POSITIONS } from "@/lib/constants";
import { anthropic, DEFAULT_MODEL } from "@/lib/ai/client";

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
      eq(onboardingGuides.schoolYear, CURRENT_SCHOOL_YEAR)
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
    // Invalid JSON, return null content
  }

  return { guide, content, sourcesUsed };
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
 * Generate an onboarding guide for a position
 * This gathers context from handoff notes, knowledge base, and Drive files
 */
export async function generateGuide(
  position: PtaBoardPosition
): Promise<{ success: boolean; guideId?: string; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const positionLabel = PTA_BOARD_POSITIONS[position];
  const sourcesUsed: SourceUsed[] = [];

  // Check if guide already exists for this year
  const existing = await db.query.onboardingGuides.findFirst({
    where: and(
      eq(onboardingGuides.schoolId, schoolId),
      eq(onboardingGuides.position, position),
      eq(onboardingGuides.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  // Create or update to "generating" status
  let guideId: string;
  if (existing) {
    await db
      .update(onboardingGuides)
      .set({ status: "generating", generatedBy: user.id })
      .where(eq(onboardingGuides.id, existing.id));
    guideId = existing.id;
  } else {
    const [newGuide] = await db
      .insert(onboardingGuides)
      .values({
        schoolId,
        position,
        schoolYear: CURRENT_SCHOOL_YEAR,
        status: "generating",
        generatedBy: user.id,
      })
      .returning();
    guideId = newGuide.id;
  }

  try {
    // 1. Gather handoff notes from predecessors (last 3 years)
    const handoffNotes = await db.query.boardHandoffNotes.findMany({
      where: and(
        eq(boardHandoffNotes.schoolId, schoolId),
        eq(boardHandoffNotes.position, position)
      ),
      with: {
        fromUser: { columns: { name: true } },
      },
      orderBy: [desc(boardHandoffNotes.schoolYear)],
      limit: 3,
    });

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
    const positionKeywords = getPositionKeywords(position);
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

    // 3. Search indexed Drive files for role-specific content
    let driveContext = "";
    try {
      if (positionKeywords.length > 0) {
        const searchQuery = positionKeywords.join(" | ");

        const indexedFiles = await db.execute<{
          id: string;
          file_id: string;
          file_name: string;
          text_content: string | null;
        }>(sql`
          SELECT
            dfi.id,
            dfi.file_id,
            dfi.file_name,
            dfi.text_content
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
            driveContext += `\n--- Drive Document: ${file.file_name} ---\n${truncated}\n`;
          }

          sourcesUsed.push({
            type: "indexed_file",
            title: file.file_name,
            url: file.file_id
              ? `https://drive.google.com/file/d/${file.file_id}`
              : undefined,
          });
        }
      }
    } catch (error) {
      console.error("Drive index search failed:", error);
    }

    // 4. Get role-specific data (e.g., budget for Treasurer)
    let roleSpecificContext = "";
    if (position === "treasurer") {
      roleSpecificContext = `
As Treasurer, you'll be responsible for:
- Managing the PTA budget and financial records
- Processing reimbursements and payments
- Presenting financial reports at meetings
- Working with the bank and maintaining accounts
- Ensuring compliance with PTA financial guidelines
`;
    } else if (position === "secretary") {
      roleSpecificContext = `
As Secretary, you'll be responsible for:
- Taking and distributing meeting minutes
- Maintaining official PTA records
- Managing correspondence
- Keeping membership records
- Supporting the President with administrative tasks
`;
    } else if (position === "president") {
      roleSpecificContext = `
As President, you'll be responsible for:
- Leading PTA meetings and setting agendas
- Coordinating with school administration
- Overseeing committee chairs
- Representing the PTA in the community
- Strategic planning for the school year
`;
    } else if (position === "membership_vp") {
      roleSpecificContext = `
As Membership VP, you'll be responsible for:
- Running membership campaigns
- Tracking membership numbers and goals
- Coordinating membership drives
- Managing member communications
- Reporting membership status at meetings
`;
    }

    // 5. Generate the guide using AI
    const message = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are an experienced PTA board member helping create an onboarding guide for someone new to the ${positionLabel} position at an elementary school PTA.

Based on the context provided below, generate a comprehensive onboarding guide that will help the new ${positionLabel} succeed in their role.

${roleSpecificContext ? `ROLE CONTEXT:\n${roleSpecificContext}` : ""}

${handoffContext ? `HANDOFF NOTES FROM PREDECESSORS:\n${handoffContext}` : "No handoff notes available."}

${articleContext ? `RELEVANT KNOWLEDGE BASE ARTICLES:\n${articleContext}` : ""}

${driveContext ? `RELATED DOCUMENTS:\n${driveContext}` : ""}

Generate a JSON object with these fields:
- "overview": A 2-3 paragraph overview of the ${positionLabel} role and what to expect
- "keyResponsibilities": Array of 5-8 key responsibilities for this role
- "firstWeekChecklist": Array of 5-7 things to do in the first week
- "monthlyCalendar": Array of objects with "month" (e.g., "August", "September") and "tasks" (array of typical tasks for that month), covering the school year Aug-May
- "importantContacts": Array of key people/roles to connect with (e.g., "School Principal", "Previous ${positionLabel}")
- "tipsFromPredecessors": Array of 3-5 tips extracted from handoff notes or general best practices
- "resources": Array of objects with "title", "url" (optional), and "description" for helpful resources
- "summary": A brief 1-2 sentence summary/welcome message

IMPORTANT:
- Incorporate specific insights from the handoff notes if available
- Make the guide practical and actionable
- Keep the tone friendly and encouraging
- If handoff notes mention specific events, contacts, or processes, include them

Return ONLY the JSON object, no other text.`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonStr = text
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    const content = JSON.parse(jsonStr) as OnboardingGuideContent;

    // Update guide with generated content
    await db
      .update(onboardingGuides)
      .set({
        status: "ready",
        content: JSON.stringify(content),
        sourcesUsed: JSON.stringify(sourcesUsed),
        generatedAt: new Date(),
      })
      .where(eq(onboardingGuides.id, guideId));

    revalidatePath("/onboarding");
    revalidatePath("/onboarding/guide");
    return { success: true, guideId };
  } catch (error) {
    console.error("Guide generation failed:", error);

    // Mark as failed
    await db
      .update(onboardingGuides)
      .set({ status: "failed" })
      .where(eq(onboardingGuides.id, guideId));

    return {
      success: false,
      error: error instanceof Error ? error.message : "Generation failed",
    };
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  const positionLabel = PTA_BOARD_POSITIONS[guide.position];

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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

// Helper function to get keywords for position-specific searches
function getPositionKeywords(position: PtaBoardPosition): string[] {
  const keywordMap: Record<PtaBoardPosition, string[]> = {
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

  return keywordMap[position] || [];
}
