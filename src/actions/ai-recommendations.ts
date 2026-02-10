"use server";

import Anthropic from "@anthropic-ai/sdk";
import {
  assertAuthenticated,
  assertEventPlanAccess,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventPlans,
  eventPlanResources,
  eventPlanAiRecommendations,
  knowledgeArticles,
} from "@/lib/db/schema";
import { eq, ilike, or, and, desc, sql } from "drizzle-orm";
import {
  listAllDriveFiles,
  getFileContent,
  parseDriveFileId,
  getFileMeta,
} from "@/lib/drive";
import { revalidatePath } from "next/cache";
import type { TaskTimingTag } from "@/types";

const anthropic = new Anthropic();

export interface SuggestedTask {
  title: string;
  description: string;
  timingTag?: TaskTimingTag;
}

export interface SourceUsed {
  type: "knowledge_article" | "drive_file" | "indexed_file" | "attached_resource";
  title: string;
  url?: string;
}

export interface EventRecommendation {
  suggestedTasks: SuggestedTask[];
  tips: string[];
  estimatedVolunteers: string;
  budgetSuggestions: string;
  enhancements: string[];
  summary: string;
  sourcesUsed: SourceUsed[];
}

export async function getEventRecommendations(
  eventPlanId: string,
  additionalContext?: string
): Promise<EventRecommendation> {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const plan = await db.query.eventPlans.findFirst({
    where: and(
      eq(eventPlans.id, eventPlanId),
      eq(eventPlans.schoolId, schoolId)
    ),
  });
  if (!plan) throw new Error("Event plan not found");

  // Track sources used for recommendations
  const sourcesUsed: SourceUsed[] = [];

  // Find relevant knowledge articles for current school
  const searchTerms = [plan.title, plan.eventType].filter(Boolean);
  const searchCondition =
    searchTerms.length > 0
      ? or(
          ...searchTerms.map((term) =>
            ilike(knowledgeArticles.title, `%${term}%`)
          ),
          ...searchTerms.map((term) =>
            ilike(knowledgeArticles.category, `%${term}%`)
          )
        )
      : undefined;

  const articles = await db.query.knowledgeArticles.findMany({
    where: searchCondition
      ? and(eq(knowledgeArticles.schoolId, schoolId), searchCondition)
      : eq(knowledgeArticles.schoolId, schoolId),
    limit: 5,
  });

  // Track knowledge articles as sources
  for (const article of articles) {
    sourcesUsed.push({
      type: "knowledge_article",
      title: article.title,
      url: article.googleDriveUrl || undefined,
    });
  }

  // Search the indexed Drive files using full-text search for relevant content
  // Weight hierarchy: A = fileName, B = integrationName, C = textContent
  // Files from the same school year as the event get a boost
  let indexedContext = "";
  try {
    if (searchTerms.length > 0) {
      // Build phrase query from title for exact phrase matching
      // Strip numbers (years) and clean up for phrase search
      const phraseText = plan.title
        .replace(/\d+/g, "")
        .replace(/[^\w\s]/g, "")
        .trim()
        .toLowerCase();

      // Also build word-based fallback query with stop words filtered
      const stopWords = new Set([
        "day", "event", "events", "school", "pta", "the", "and", "for",
        "with", "our", "your", "this", "that", "from", "have", "has",
        "will", "can", "are", "was", "were", "been", "being", "party",
        "meeting", "year", "annual", "new", "all", "any", "each",
      ]);
      const searchWords = searchTerms
        .filter(Boolean)
        .join(" ")
        .split(/\s+/)
        .map((w) => w.replace(/[^\w]/g, "").toLowerCase())
        .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !stopWords.has(w));
      const fallbackQuery = searchWords.length > 0 ? searchWords.join(" | ") : null;

      const eventSchoolYear = plan.schoolYear;

      if (!phraseText && !fallbackQuery) {
        // No valid search terms, skip indexed search
      } else {

      // Two-phase search: first try phrase matching, then fall back to word OR
      // Use PostgreSQL full-text search with ts_rank for relevance ordering
      // Boost files from the same school year as the event plan
      const indexedFiles = await db.execute<{
        id: string;
        file_id: string;
        file_name: string;
        text_content: string | null;
        integration_name: string | null;
        integration_school_year: string | null;
        rank: number;
      }>(sql`
        WITH phrase_matches AS (
          SELECT
            dfi.id,
            dfi.file_id,
            dfi.file_name,
            dfi.text_content,
            dfi.integration_name,
            sdi.school_year as integration_school_year,
            ts_rank(dfi.search_vector, phraseto_tsquery('english', ${phraseText}))
              * CASE
                WHEN sdi.school_year = ${eventSchoolYear} THEN 1.5
                WHEN sdi.school_year IS NULL THEN 1.0
                ELSE 0.8
              END as rank,
            1 as match_type
          FROM drive_file_index dfi
          LEFT JOIN school_drive_integrations sdi ON dfi.integration_id = sdi.id
          WHERE dfi.school_id = ${schoolId}
            AND ${phraseText} != ''
            AND dfi.search_vector @@ phraseto_tsquery('english', ${phraseText})
        ),
        word_matches AS (
          SELECT
            dfi.id,
            dfi.file_id,
            dfi.file_name,
            dfi.text_content,
            dfi.integration_name,
            sdi.school_year as integration_school_year,
            ts_rank(dfi.search_vector, to_tsquery('english', ${fallbackQuery || ""}))
              * CASE
                WHEN sdi.school_year = ${eventSchoolYear} THEN 1.5
                WHEN sdi.school_year IS NULL THEN 1.0
                ELSE 0.8
              END as rank,
            2 as match_type
          FROM drive_file_index dfi
          LEFT JOIN school_drive_integrations sdi ON dfi.integration_id = sdi.id
          WHERE dfi.school_id = ${schoolId}
            AND ${fallbackQuery || ""} != ''
            AND dfi.search_vector @@ to_tsquery('english', ${fallbackQuery || ""})
            AND NOT EXISTS (SELECT 1 FROM phrase_matches)
        )
        SELECT id, file_id, file_name, text_content, integration_name, integration_school_year, rank
        FROM phrase_matches
        UNION ALL
        SELECT id, file_id, file_name, text_content, integration_name, integration_school_year, rank
        FROM word_matches
        ORDER BY rank DESC
        LIMIT 8
      `);

      for (const file of indexedFiles.rows) {
        // Track all matched files as sources (title match is valuable)
        sourcesUsed.push({
          type: "indexed_file",
          title: file.file_name,
          url: file.file_id
            ? `https://drive.google.com/file/d/${file.file_id}`
            : undefined,
        });

        // Add text content to context if available
        if (file.text_content) {
          const truncated =
            file.text_content.length > 3000
              ? file.text_content.slice(0, 3000) + "\n[truncated]"
              : file.text_content;
          indexedContext += `\n\n--- Indexed Document: ${file.file_name} ---\n${truncated}`;
        }
      }
      }
    }
  } catch (error) {
    // Index search failed, continue without
    console.error("Drive file index search failed:", error);
  }

  // Try to fetch content from Google Drive files (fallback if index is empty)
  let driveContext = "";
  if (!indexedContext) {
    try {
      const driveFiles = await listAllDriveFiles(schoolId);
      const relevantFiles = driveFiles.filter((f) =>
        searchTerms.some(
          (term) => term && f.name.toLowerCase().includes(term.toLowerCase())
        )
      );

      // Get content from up to 3 relevant files
      for (const file of relevantFiles.slice(0, 3)) {
        // Track all matched files as sources (title match is valuable)
        sourcesUsed.push({
          type: "drive_file",
          title: file.name,
          url: `https://drive.google.com/file/d/${file.id}`,
        });

        try {
          const content = await getFileContent(schoolId, file.id, file.mimeType);
          if (content) {
            const truncated =
              content.length > 5000
                ? content.slice(0, 5000) + "\n[truncated]"
                : content;
            driveContext += `\n\n--- Document: ${file.name} ---\n${truncated}`;
          }
        } catch {
          // Skip files that can't be read
        }
      }
    } catch {
      // Drive integration may not be configured
    }
  }

  // Fetch content from Google Drive resources attached to this event plan
  let resourceContext = "";
  try {
    const resources = await db.query.eventPlanResources.findMany({
      where: eq(eventPlanResources.eventPlanId, eventPlanId),
    });

    for (const resource of resources) {
      if (!resource.url) continue;
      const fileId = parseDriveFileId(resource.url);
      if (!fileId) continue;

      try {
        const meta = await getFileMeta(schoolId, fileId);
        if (!meta) continue;
        const content = await getFileContent(schoolId, fileId, meta.mimeType);
        if (content) {
          const truncated =
            content.length > 5000
              ? content.slice(0, 5000) + "\n[truncated]"
              : content;
          resourceContext += `\n\n--- Attached Resource: ${resource.title} ---\n${truncated}`;

          // Track attached resource as source
          sourcesUsed.push({
            type: "attached_resource",
            title: resource.title,
            url: resource.url || undefined,
          });
        }
      } catch {
        // Skip resources that can't be read via Drive
      }
    }
  } catch {
    // Resource fetching failed, continue without
  }

  const articleSummaries = articles
    .map(
      (a) => `- ${a.title}: ${a.summary || "No summary"} (${a.category})`
    )
    .join("\n");

  const contextSection = indexedContext || driveContext;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a helpful PTA event planning assistant for an elementary school. Based on the event details and any past documentation provided, generate comprehensive planning recommendations.

Event Details:
- Title: ${plan.title}
- Type: ${plan.eventType || "Not specified"}
- Description: ${plan.description || "Not specified"}
- Date: ${plan.eventDate?.toISOString().split("T")[0] || "Not set"}
- Location: ${plan.location || "Not specified"}
- Budget: ${plan.budget || "Not specified"}

${additionalContext ? `\nAdditional Context from User:\n${additionalContext}` : ""}

${articleSummaries ? `\nRelated Knowledge Base Articles:\n${articleSummaries}` : ""}

${contextSection ? `\nPast Planning Documents:${contextSection}` : ""}

${resourceContext ? `\nAttached Event Resources:${resourceContext}` : ""}

IMPORTANT INSTRUCTIONS:
1. Carefully analyze the event DESCRIPTION above - suggest specific enhancements and improvements based on what the organizer wants to achieve.
2. Look for lessons learned, tips, and improvements mentioned in the past documents - incorporate these insights.
3. For each suggested task, assign a timing category:
   - "day_of" for tasks that happen on the event day
   - "days_before" for tasks 1-7 days before the event
   - "week_plus_before" for tasks more than a week before the event

Return a JSON object with these fields:
- "suggestedTasks": An array of 6-10 planning tasks, each with "title", "description", and "timingTag" (one of: "day_of", "days_before", "week_plus_before"). Make them specific and actionable. Order them roughly by when they should be done (earliest first).
- "tips": An array of 3-5 practical tips for planning this type of event, incorporating any lessons from past documents
- "enhancements": An array of 2-4 specific enhancement suggestions based on the event description - ways to make this particular event better or more memorable
- "estimatedVolunteers": A brief estimate of how many volunteers might be needed and for what roles
- "budgetSuggestions": Brief budget advice or common cost categories for this type of event
- "summary": A 2-3 sentence overview of recommendations

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
  const parsed = JSON.parse(jsonStr);

  return {
    suggestedTasks: Array.isArray(parsed.suggestedTasks)
      ? parsed.suggestedTasks.map(
          (t: { title: string; description: string; timingTag?: string }) => ({
            title: t.title,
            description: t.description,
            timingTag: ["day_of", "days_before", "week_plus_before"].includes(
              t.timingTag || ""
            )
              ? (t.timingTag as TaskTimingTag)
              : undefined,
          })
        )
      : [],
    tips: Array.isArray(parsed.tips) ? parsed.tips : [],
    enhancements: Array.isArray(parsed.enhancements) ? parsed.enhancements : [],
    estimatedVolunteers: parsed.estimatedVolunteers || "",
    budgetSuggestions: parsed.budgetSuggestions || "",
    summary: parsed.summary || "",
    sourcesUsed,
  };
}

// ─── Save/List/Delete Recommendations ─────────────────────────────────────────

export async function saveEventRecommendation(
  eventPlanId: string,
  title: string,
  additionalContext: string | null,
  response: EventRecommendation
) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);

  const [saved] = await db
    .insert(eventPlanAiRecommendations)
    .values({
      eventPlanId,
      title,
      additionalContext,
      response: JSON.stringify(response),
      createdBy: user.id!,
    })
    .returning();

  revalidatePath(`/events/${eventPlanId}`);
  return saved;
}

export async function listEventRecommendations(eventPlanId: string) {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);

  const recommendations = await db.query.eventPlanAiRecommendations.findMany({
    where: eq(eventPlanAiRecommendations.eventPlanId, eventPlanId),
    orderBy: [desc(eventPlanAiRecommendations.createdAt)],
    with: {
      creator: {
        columns: { name: true, email: true },
      },
    },
  });

  return recommendations.map((r) => ({
    id: r.id,
    title: r.title,
    additionalContext: r.additionalContext,
    response: JSON.parse(r.response) as EventRecommendation,
    createdBy: r.createdBy,
    creatorName: r.creator?.name || r.creator?.email || "Unknown",
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
  }));
}

export async function deleteEventRecommendation(recommendationId: string) {
  const user = await assertAuthenticated();

  const recommendation = await db.query.eventPlanAiRecommendations.findFirst({
    where: eq(eventPlanAiRecommendations.id, recommendationId),
  });
  if (!recommendation) throw new Error("Recommendation not found");

  // Check if user is creator or has lead access
  const isCreator = recommendation.createdBy === user.id;
  if (!isCreator) {
    await assertEventPlanAccess(user.id!, recommendation.eventPlanId, ["lead"]);
  }

  await db
    .delete(eventPlanAiRecommendations)
    .where(eq(eventPlanAiRecommendations.id, recommendationId));

  revalidatePath(`/events/${recommendation.eventPlanId}`);
}
