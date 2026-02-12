"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { ptaMinutes, knowledgeArticles } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Get all minutes for the current school.
 * Regular members only see approved minutes.
 * PTA board members see all minutes including pending.
 */
export async function getMinutes(options?: {
  status?: "pending" | "approved";
  includeAll?: boolean;
}) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const conditions = [eq(ptaMinutes.schoolId, schoolId)];

  // If a specific status is requested, filter by it
  if (options?.status) {
    conditions.push(eq(ptaMinutes.status, options.status));
  }

  return db.query.ptaMinutes.findMany({
    where: and(...conditions),
    orderBy: [desc(ptaMinutes.meetingDate), desc(ptaMinutes.createdAt)],
    with: {
      approver: { columns: { name: true, email: true } },
    },
  });
}

/**
 * Get a single minutes record by ID.
 */
export async function getMinutesById(minutesId: string) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  return db.query.ptaMinutes.findFirst({
    where: and(
      eq(ptaMinutes.id, minutesId),
      eq(ptaMinutes.schoolId, schoolId)
    ),
    with: {
      approver: { columns: { name: true, email: true } },
    },
  });
}

/**
 * Approve minutes.
 * Requires PTA board role.
 */
export async function approveMinutes(minutesId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the minutes belong to this school
  const minutes = await db.query.ptaMinutes.findFirst({
    where: and(
      eq(ptaMinutes.id, minutesId),
      eq(ptaMinutes.schoolId, schoolId)
    ),
  });

  if (!minutes) {
    throw new Error("Minutes not found");
  }

  await db
    .update(ptaMinutes)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedBy: user.id!,
    })
    .where(eq(ptaMinutes.id, minutesId));

  revalidatePath("/minutes");
  revalidatePath(`/minutes/${minutesId}`);
}

/**
 * Set the meeting date for minutes.
 * Requires PTA board role.
 */
export async function setMeetingDate(minutesId: string, date: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the minutes belong to this school
  const minutes = await db.query.ptaMinutes.findFirst({
    where: and(
      eq(ptaMinutes.id, minutesId),
      eq(ptaMinutes.schoolId, schoolId)
    ),
  });

  if (!minutes) {
    throw new Error("Minutes not found");
  }

  await db
    .update(ptaMinutes)
    .set({ meetingDate: date })
    .where(eq(ptaMinutes.id, minutesId));

  revalidatePath("/minutes");
  revalidatePath(`/minutes/${minutesId}`);
}

/**
 * Delete a minutes/agenda record.
 * Requires PTA board role.
 * Will also clear sourceMinutesId on any related knowledge articles.
 */
export async function deleteMinutes(minutesId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the minutes belong to this school
  const minutes = await db.query.ptaMinutes.findFirst({
    where: and(
      eq(ptaMinutes.id, minutesId),
      eq(ptaMinutes.schoolId, schoolId)
    ),
  });

  if (!minutes) {
    throw new Error("Minutes not found");
  }

  // Clear sourceMinutesId on any linked knowledge articles (don't delete them)
  await db
    .update(knowledgeArticles)
    .set({ sourceMinutesId: null })
    .where(eq(knowledgeArticles.sourceMinutesId, minutesId));

  // Delete the minutes record
  await db.delete(ptaMinutes).where(eq(ptaMinutes.id, minutesId));

  revalidatePath("/minutes");
}

/**
 * Regenerate the AI summary for minutes.
 * Requires PTA board role.
 * @deprecated Use regenerateAnalysis for richer output
 */
export async function regenerateSummary(minutesId: string) {
  const result = await regenerateAnalysis(minutesId);
  return { summary: result.summary };
}

/**
 * Regenerate the full AI analysis for minutes (rich summary + tags).
 * Requires PTA board role.
 */
export async function regenerateAnalysis(minutesId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const minutes = await db.query.ptaMinutes.findFirst({
    where: and(
      eq(ptaMinutes.id, minutesId),
      eq(ptaMinutes.schoolId, schoolId)
    ),
  });

  if (!minutes) {
    throw new Error("Minutes not found");
  }

  if (!minutes.textContent) {
    throw new Error("No text content available for this minutes file");
  }

  // Get existing tags for consistency
  const { getTagNames } = await import("@/actions/tags");
  const existingTags = await getTagNames();

  const { generateMinutesAnalysis } = await import("@/lib/ai/minutes-analysis");
  const analysis = await generateMinutesAnalysis(
    minutes.textContent,
    minutes.fileName,
    existingTags
  );

  // Update minutes with analysis results
  await db
    .update(ptaMinutes)
    .set({
      aiSummary: analysis.summary,
      aiKeyItems: analysis.keyItems,
      aiActionItems: analysis.actionItems,
      aiImprovements: analysis.improvements,
      tags: analysis.suggestedTags,
      aiExtractedDate: analysis.extractedDate,
      dateConfidence: analysis.dateConfidence,
      // Update meetingDate if AI found one with high confidence and none exists
      meetingDate:
        !minutes.meetingDate && analysis.dateConfidence === "high"
          ? analysis.extractedDate
          : minutes.meetingDate,
    })
    .where(eq(ptaMinutes.id, minutesId));

  // Ensure tags exist in the database
  if (analysis.suggestedTags.length > 0) {
    const { ensureTagsExist } = await import("@/actions/tags");
    await ensureTagsExist(analysis.suggestedTags);
  }

  revalidatePath("/minutes");
  revalidatePath(`/minutes/${minutesId}`);

  return analysis;
}

/**
 * Update tags on a minutes record.
 * Requires PTA board role.
 */
export async function updateMinutesTags(minutesId: string, tags: string[]) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get current tags to calculate diff
  const minutes = await db.query.ptaMinutes.findFirst({
    where: and(
      eq(ptaMinutes.id, minutesId),
      eq(ptaMinutes.schoolId, schoolId)
    ),
    columns: { tags: true },
  });

  if (!minutes) {
    throw new Error("Minutes not found");
  }

  const oldTags = minutes.tags || [];
  const newTags = tags;

  // Find added and removed tags
  const addedTags = newTags.filter((t) => !oldTags.includes(t));
  const removedTags = oldTags.filter((t) => !newTags.includes(t));

  await db
    .update(ptaMinutes)
    .set({ tags: newTags })
    .where(eq(ptaMinutes.id, minutesId));

  // Update tag usage counts
  if (addedTags.length > 0) {
    const { ensureTagsExist } = await import("@/actions/tags");
    await ensureTagsExist(addedTags);
  }
  if (removedTags.length > 0) {
    const { decrementTagUsage } = await import("@/actions/tags");
    await decrementTagUsage(removedTags);
  }

  revalidatePath("/minutes");
  revalidatePath(`/minutes/${minutesId}`);
}

/**
 * Batch regenerate analysis for all minutes without rich summaries.
 * Requires PTA board role.
 * Returns progress information.
 *
 * Processes files in parallel batches for efficiency while respecting rate limits.
 */
export async function backfillMinutesAnalysis() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { isNull } = await import("drizzle-orm");

  // Get minutes that need processing (have content but no rich analysis)
  const minutesToProcess = await db.query.ptaMinutes.findMany({
    where: and(
      eq(ptaMinutes.schoolId, schoolId),
      isNull(ptaMinutes.aiKeyItems)
    ),
    columns: { id: true, textContent: true, fileName: true },
  });

  // Filter to only those with text content
  const validMinutes = minutesToProcess.filter((m) => m.textContent);

  let processed = 0;
  let errors = 0;

  // Process in parallel batches of 5
  const BATCH_SIZE = 5;
  const DELAY_BETWEEN_BATCHES_MS = 2000;

  for (let i = 0; i < validMinutes.length; i += BATCH_SIZE) {
    const batch = validMinutes.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const results = await Promise.allSettled(
      batch.map((m) => regenerateAnalysis(m.id))
    );

    // Count successes and failures
    for (const result of results) {
      if (result.status === "fulfilled") {
        processed++;
      } else {
        console.error("Failed to process minutes:", result.reason);
        errors++;
      }
    }

    // Add delay between batches to avoid rate limiting (skip after last batch)
    if (i + BATCH_SIZE < validMinutes.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  revalidatePath("/minutes");
  revalidatePath("/admin/tags");

  return { processed, errors, total: validMinutes.length };
}

/**
 * Trigger a manual sync of minutes from Google Drive.
 * Requires PTA board role.
 */
export async function triggerMinutesSync() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { syncSchoolMinutes } = await import("@/lib/sync/minutes-sync");
  const result = await syncSchoolMinutes(schoolId);

  revalidatePath("/minutes");

  return result;
}

// ─── Agenda Actions ─────────────────────────────────────────────────────────

/**
 * Get all agendas for the current school.
 */
export async function getAgendas() {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const { ptaAgendas } = await import("@/lib/db/schema");

  return db.query.ptaAgendas.findMany({
    where: eq(ptaAgendas.schoolId, schoolId),
    orderBy: [desc(ptaAgendas.createdAt)],
    with: {
      creator: { columns: { name: true } },
    },
  });
}

/**
 * Get a single agenda by ID.
 */
export async function getAgendaById(agendaId: string) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const { ptaAgendas } = await import("@/lib/db/schema");

  return db.query.ptaAgendas.findFirst({
    where: and(eq(ptaAgendas.id, agendaId), eq(ptaAgendas.schoolId, schoolId)),
    with: {
      creator: { columns: { name: true, email: true } },
    },
  });
}

/**
 * Generate a new agenda using AI.
 * Requires PTA board role.
 * Uses both minutes AND agendas from the same month in previous years.
 */
export async function generateAgenda(targetMonth: number, targetYear: number) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get all historical documents (both minutes and agendas) from same month in previous years
  // Using the new meetingMonth and meetingYear fields for efficient filtering
  const historicalDocuments = await db.query.ptaMinutes.findMany({
    where: and(
      eq(ptaMinutes.schoolId, schoolId),
      eq(ptaMinutes.status, "approved"),
      eq(ptaMinutes.meetingMonth, targetMonth)
    ),
    columns: {
      fileName: true,
      meetingDate: true,
      meetingMonth: true,
      meetingYear: true,
      aiSummary: true,
      schoolYear: true,
      documentType: true,
    },
  });

  // Filter to previous years only and separate into minutes and agendas
  const sameMonthHistoricalMinutes = historicalDocuments.filter(
    (m) => m.meetingYear && m.meetingYear < targetYear && m.documentType === "minutes"
  );
  const sameMonthHistoricalAgendas = historicalDocuments.filter(
    (m) => m.meetingYear && m.meetingYear < targetYear && m.documentType === "agenda"
  );

  // Get last 3 recent minutes (actual minutes, not agendas)
  const recentMinutes = await db.query.ptaMinutes.findMany({
    where: and(
      eq(ptaMinutes.schoolId, schoolId),
      eq(ptaMinutes.status, "approved"),
      eq(ptaMinutes.documentType, "minutes")
    ),
    orderBy: [desc(ptaMinutes.meetingDate)],
    limit: 3,
    columns: {
      fileName: true,
      meetingDate: true,
      aiSummary: true,
      schoolYear: true,
      documentType: true,
    },
  });

  const { generateAgendaFromHistory } = await import("@/lib/ai/agenda-generator");
  const result = await generateAgendaFromHistory(
    targetMonth,
    targetYear,
    sameMonthHistoricalMinutes,
    sameMonthHistoricalAgendas,
    recentMinutes
  );

  return result;
}

/**
 * Save a generated or edited agenda.
 * Requires PTA board role.
 */
export async function saveAgenda(data: {
  title: string;
  targetMonth: number;
  targetYear: number;
  content: string;
  aiGeneratedContent?: string;
  sourceMinutesIds?: string[];
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { ptaAgendas } = await import("@/lib/db/schema");

  const [agenda] = await db
    .insert(ptaAgendas)
    .values({
      schoolId,
      title: data.title,
      targetMonth: data.targetMonth,
      targetYear: data.targetYear,
      content: data.content,
      aiGeneratedContent: data.aiGeneratedContent,
      sourceMinutesIds: data.sourceMinutesIds,
      createdBy: user.id!,
    })
    .returning();

  revalidatePath("/minutes/agenda");
  return agenda;
}

/**
 * Update an existing agenda.
 * Requires PTA board role.
 */
export async function updateAgenda(
  agendaId: string,
  data: {
    title?: string;
    content?: string;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { ptaAgendas } = await import("@/lib/db/schema");

  await db
    .update(ptaAgendas)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(ptaAgendas.id, agendaId), eq(ptaAgendas.schoolId, schoolId)));

  revalidatePath("/minutes/agenda");
  revalidatePath(`/minutes/agenda/${agendaId}`);
}

/**
 * Delete an agenda.
 * Requires PTA board role.
 */
export async function deleteAgenda(agendaId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const { ptaAgendas } = await import("@/lib/db/schema");

  await db
    .delete(ptaAgendas)
    .where(and(eq(ptaAgendas.id, agendaId), eq(ptaAgendas.schoolId, schoolId)));

  revalidatePath("/minutes/agenda");
}
