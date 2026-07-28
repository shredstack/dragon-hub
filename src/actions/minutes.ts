"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { calendarEvents, ptaMinutes, knowledgeArticles } from "@/lib/db/schema";
import { eq, and, asc, gte, isNull, lt, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import {
  formatLongDateInTimeZone,
  formatTimeInTimeZone,
  zonedTimeToUtc,
} from "@/lib/time-zone";
import type { ScheduledMeeting } from "@/lib/ai/agenda-generator";

/**
 * Get all minutes for the current school.
 * Regular members only see approved minutes.
 * PTA board members see all minutes including pending.
 */
export async function getMinutes(options?: {
  status?: "pending" | "approved";
  includeAll?: boolean;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const conditions = [eq(ptaMinutes.schoolId, schoolId)];

  // The docstring above has always promised this and the body never did it:
  // unapproved minutes are a draft record of a board meeting, and every
  // authenticated member could read them. The board's own view passes through
  // unfiltered; everyone else is pinned to approved before any caller-supplied
  // filter is applied, so `status: "pending"` can only ever narrow to nothing.
  const isBoard = await isPtaBoardMember(user.id!, schoolId);
  if (!isBoard) {
    conditions.push(eq(ptaMinutes.status, "approved"));
  }

  // If a specific status is requested, filter by it
  if (options?.status) {
    conditions.push(eq(ptaMinutes.status, options.status));
  }

  conditions.push(isNull(ptaMinutes.archivedAt));

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
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isBoard = await isPtaBoardMember(user.id!, schoolId);

  return db.query.ptaMinutes.findFirst({
    where: and(
      eq(ptaMinutes.id, minutesId),
      eq(ptaMinutes.schoolId, schoolId),
      // Same rule as the list: a direct link to a draft shouldn't open it.
      ...(isBoard ? [] : [eq(ptaMinutes.status, "approved")])
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
  await assertPtaBoardMember(user.id!, schoolId);

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
  await assertPtaBoardMember(user.id!, schoolId);

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
/** Hides a minutes record from the archive view without destroying it. */
export async function archiveMinutes(minutesId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  await db
    .update(ptaMinutes)
    .set({ archivedAt: new Date(), archivedBy: user.id! })
    .where(and(eq(ptaMinutes.id, minutesId), eq(ptaMinutes.schoolId, schoolId)));

  revalidatePath("/minutes");
}

export async function restoreMinutes(minutesId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  await db
    .update(ptaMinutes)
    .set({ archivedAt: null, archivedBy: null })
    .where(and(eq(ptaMinutes.id, minutesId), eq(ptaMinutes.schoolId, schoolId)));

  revalidatePath("/minutes");
}

/**
 * Permanently delete a minutes record.
 *
 * Approved minutes are the school's official record of a decision, and any
 * knowledge article citing them loses its source, so those can only be
 * archived. A pending record is an unreviewed sync artefact and deletes freely.
 */
export async function deleteMinutes(minutesId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

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

  const citedBy = await db.$count(
    knowledgeArticles,
    eq(knowledgeArticles.sourceMinutesId, minutesId)
  );

  if (minutes.status === "approved" || citedBy > 0) {
    const reason =
      minutes.status === "approved"
        ? "These minutes are approved, so they're part of the school's official record"
        : `${citedBy} knowledge ${citedBy === 1 ? "article cites" : "articles cite"} these minutes as their source`;
    throw new Error(
      `${reason}. Archive them instead — that hides them from the minutes list without losing the record.`
    );
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
  await assertPtaBoardMember(user.id!, schoolId);

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
    const { ensureTagsExist } = await import("@/lib/tag-usage");
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
  await assertPtaBoardMember(user.id!, schoolId);

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
    const { ensureTagsExist } = await import("@/lib/tag-usage");
    await ensureTagsExist(addedTags);
  }
  if (removedTags.length > 0) {
    const { decrementTagUsage } = await import("@/lib/tag-usage");
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
  await assertPtaBoardMember(user.id!, schoolId);

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
  await assertPtaBoardMember(user.id!, schoolId);

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
    where: and(
      eq(ptaAgendas.schoolId, schoolId),
      isNull(ptaAgendas.archivedAt)
    ),
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
  await assertPtaBoardMember(user.id!, schoolId);

  // Get all historical documents (both minutes and agendas) from same month in previous years
  // Using the new meetingMonth and meetingYear fields for efficient filtering.
  // Intentionally NOT filtering by status: prior-year minutes/agendas are grounding
  // context for an internal AI draft, not a published record, so pending (un-approved)
  // documents are included to maximize historical context. The recent-minutes query
  // below stays approved-only, since current-cycle follow-up items should come from
  // ratified records.
  const historicalDocuments = await db.query.ptaMinutes.findMany({
    where: and(
      eq(ptaMinutes.schoolId, schoolId),
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

  const scheduledMeeting = await findScheduledMeeting(
    schoolId,
    targetMonth,
    targetYear
  );

  const { generateAgendaFromHistory } = await import("@/lib/ai/agenda-generator");
  const result = await generateAgendaFromHistory(
    targetMonth,
    targetYear,
    sameMonthHistoricalMinutes,
    sameMonthHistoricalAgendas,
    recentMinutes,
    scheduledMeeting
  );

  return result;
}

/**
 * Words that mark a calendar entry as *the* PTA meeting. Deliberately narrow:
 * a false positive puts the wrong date on the agenda, which is worse than the
 * TBD placeholder a miss produces.
 */
const MEETING_TITLE_PATTERN =
  /\b(pta|pto)\b.*\bmeeting\b|\bmeeting\b.*\b(pta|pto)\b|\b(board|general|membership|executive)\s+meeting\b/i;

/**
 * The month's PTA meeting as it exists on the school's Google Calendar.
 *
 * The agenda's date and time come from here rather than from the model, which
 * previously had nothing to go on and invented them. Times are formatted in the
 * school's own zone — the stored instant is correct, but rendering it in the
 * server's zone (UTC on Vercel) is what turned a 10:30am meeting into 4:30pm.
 *
 * Returns null when nothing matches, including for a month already past: the
 * calendar sync only pulls events from now forward, so a meeting that already
 * happened isn't there to find.
 */
async function findScheduledMeeting(
  schoolId: string,
  targetMonth: number,
  targetYear: number
): Promise<ScheduledMeeting | null> {
  const timeZone = await getSchoolTimeZone(schoolId);

  // Month bounds as wall-clock in the school's zone, so a meeting on the 1st or
  // the 31st doesn't fall into the neighbouring month.
  const monthStart = zonedTimeToUtc(targetYear, targetMonth, 1, 0, 0, timeZone);
  const monthEnd = zonedTimeToUtc(
    targetMonth === 12 ? targetYear + 1 : targetYear,
    targetMonth === 12 ? 1 : targetMonth + 1,
    1,
    0,
    0,
    timeZone
  );

  const monthEvents = await db
    .select({
      title: calendarEvents.title,
      startTime: calendarEvents.startTime,
      endTime: calendarEvents.endTime,
      timeZone: calendarEvents.timeZone,
      allDay: calendarEvents.allDay,
      location: calendarEvents.location,
      eventType: calendarEvents.eventType,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.schoolId, schoolId),
        gte(calendarEvents.startTime, monthStart),
        lt(calendarEvents.startTime, monthEnd)
      )
    )
    .orderBy(asc(calendarEvents.startTime));

  const matches = monthEvents.filter((e) => MEETING_TITLE_PATTERN.test(e.title));
  if (matches.length === 0) return null;

  // A PTA-calendar entry beats a title match on the school-wide calendar.
  const meeting = matches.find((e) => e.eventType === "pta") ?? matches[0];

  // An all-day entry has no meaningful clock time and is stored as midnight UTC,
  // so it must be read back in UTC or it reports the previous day.
  const zone = meeting.allDay ? "UTC" : (meeting.timeZone ?? timeZone);

  return {
    title: meeting.title,
    date: formatLongDateInTimeZone(meeting.startTime, zone),
    time: meeting.allDay ? null : formatTimeInTimeZone(meeting.startTime, zone),
    endTime:
      meeting.allDay || !meeting.endTime
        ? null
        : formatTimeInTimeZone(meeting.endTime, zone),
    location: meeting.location,
  };
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
  await assertPtaBoardMember(user.id!, schoolId);

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
  await assertPtaBoardMember(user.id!, schoolId);

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
 * Hide an agenda from the list. This is the normal way to retire one: an
 * agenda for a meeting that actually happened is the plan of record for it.
 */
export async function archiveAgenda(agendaId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const { ptaAgendas } = await import("@/lib/db/schema");

  await db
    .update(ptaAgendas)
    .set({ archivedAt: new Date(), archivedBy: user.id!, updatedAt: new Date() })
    .where(and(eq(ptaAgendas.id, agendaId), eq(ptaAgendas.schoolId, schoolId)));

  revalidatePath("/minutes/agenda");
}

export async function restoreAgenda(agendaId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const { ptaAgendas } = await import("@/lib/db/schema");

  await db
    .update(ptaAgendas)
    .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(and(eq(ptaAgendas.id, agendaId), eq(ptaAgendas.schoolId, schoolId)));

  revalidatePath("/minutes/agenda");
}

/**
 * Permanently delete an agenda.
 * Requires PTA board role. Nothing cascades off an agenda, so this stays a
 * genuine delete — the UI steers toward archiving instead.
 */
export async function deleteAgenda(agendaId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const { ptaAgendas } = await import("@/lib/db/schema");

  await db
    .delete(ptaAgendas)
    .where(and(eq(ptaAgendas.id, agendaId), eq(ptaAgendas.schoolId, schoolId)));

  revalidatePath("/minutes/agenda");
}
