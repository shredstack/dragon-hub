"use server";

import Anthropic from "@anthropic-ai/sdk";
import { assertAuthenticated, assertEventPlanAccess, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { eventPlans, eventPlanResources, knowledgeArticles } from "@/lib/db/schema";
import { eq, ilike, or, and } from "drizzle-orm";
import { listAllDriveFiles, getFileContent, parseDriveFileId, getFileMeta } from "@/lib/drive";

const anthropic = new Anthropic();

export interface EventRecommendation {
  suggestedTasks: { title: string; description: string }[];
  tips: string[];
  estimatedVolunteers: string;
  budgetSuggestions: string;
  summary: string;
}

export async function getEventRecommendations(
  eventPlanId: string
): Promise<EventRecommendation> {
  const user = await assertAuthenticated();
  await assertEventPlanAccess(user.id!, eventPlanId);
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, eventPlanId), eq(eventPlans.schoolId, schoolId)),
  });
  if (!plan) throw new Error("Event plan not found");

  // Find relevant knowledge articles for current school
  const searchTerms = [plan.title, plan.eventType].filter(Boolean);
  const searchCondition = searchTerms.length > 0
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

  // Try to fetch content from Google Drive files
  let driveContext = "";
  try {
    const driveFiles = await listAllDriveFiles(schoolId);
    const relevantFiles = driveFiles.filter((f) =>
      searchTerms.some(
        (term) =>
          term && f.name.toLowerCase().includes(term.toLowerCase())
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

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a helpful PTA event planning assistant for an elementary school. Based on the event details and any past documentation provided, generate planning recommendations.

Event Details:
- Title: ${plan.title}
- Type: ${plan.eventType || "Not specified"}
- Description: ${plan.description || "Not specified"}
- Date: ${plan.eventDate?.toISOString().split("T")[0] || "Not set"}
- Location: ${plan.location || "Not specified"}
- Budget: ${plan.budget || "Not specified"}

${articleSummaries ? `\nRelated Knowledge Base Articles:\n${articleSummaries}` : ""}

${driveContext ? `\nPast Planning Documents:${driveContext}` : ""}

${resourceContext ? `\nAttached Event Resources:${resourceContext}` : ""}

Return a JSON object with these fields:
- "suggestedTasks": An array of 5-8 planning tasks, each with "title" and "description" fields. Make them specific and actionable.
- "tips": An array of 3-5 practical tips for planning this type of event at a school
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
      ? parsed.suggestedTasks
      : [],
    tips: Array.isArray(parsed.tips) ? parsed.tips : [],
    estimatedVolunteers: parsed.estimatedVolunteers || "",
    budgetSuggestions: parsed.budgetSuggestions || "",
    summary: parsed.summary || "",
  };
}
