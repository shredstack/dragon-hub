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
  driveFileIndex,
} from "@/lib/db/schema";
import { eq, ilike, or, and, desc } from "drizzle-orm";
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

export interface EventRecommendation {
  suggestedTasks: SuggestedTask[];
  tips: string[];
  estimatedVolunteers: string;
  budgetSuggestions: string;
  enhancements: string[];
  summary: string;
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

  // Search the indexed Drive files for relevant content
  let indexedContext = "";
  try {
    const indexSearchCondition =
      searchTerms.length > 0
        ? or(
            ...searchTerms.map((term) =>
              ilike(driveFileIndex.fileName, `%${term}%`)
            ),
            ...searchTerms.map((term) =>
              ilike(driveFileIndex.textContent, `%${term}%`)
            )
          )
        : undefined;

    if (indexSearchCondition) {
      const indexedFiles = await db.query.driveFileIndex.findMany({
        where: and(
          eq(driveFileIndex.schoolId, schoolId),
          indexSearchCondition
        ),
        limit: 5,
      });

      for (const file of indexedFiles) {
        if (file.textContent) {
          const truncated =
            file.textContent.length > 3000
              ? file.textContent.slice(0, 3000) + "\n[truncated]"
              : file.textContent;
          indexedContext += `\n\n--- Indexed Document: ${file.fileName} ---\n${truncated}`;
        }
      }
    }
  } catch {
    // Index search failed, continue without
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
      (a) => `- ${a.title}: ${a.description || "No description"} (${a.category})`
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
