"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertPtaBoardMember,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  boardHandoffNotes,
  boardHandoffSummaries,
  schoolMemberships,
  schools,
} from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type {
  PtaBoardPosition,
  BoardHandoffNoteWithUsers,
  BoardHandoffNoteForViewer,
} from "@/types";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  generateHandoffFromNotes,
  type GeneratedHandoffNote,
} from "@/lib/ai/handoff-generator";
import {
  summarizeHandoffNotes,
  type HandoffSummaryContent,
} from "@/lib/ai/handoff-summarizer";
import { getBoardPositionLabel } from "@/lib/board-positions";

export type HandoffNoteInput = {
  title?: string | null;
  keyAccomplishments?: string | null;
  ongoingProjects?: string | null;
  tipsAndAdvice?: string | null;
  importantContacts?: string | null;
  filesAndResources?: string | null; // JSON array string
};

const NOTE_WITH_USERS = {
  fromUser: { columns: { id: true, name: true, email: true } },
  toUser: { columns: { id: true, name: true, email: true } },
} as const;

/** The embedding is 1536 floats used only for server-side search — never send it to a client. */
const NOTE_COLUMNS = { embedding: false } as const;

/** Newest first. School years sort correctly as strings ("2025-2026" > "2024-2025"). */
const NEWEST_FIRST = [
  desc(boardHandoffNotes.schoolYear),
  desc(boardHandoffNotes.updatedAt),
];

/**
 * The board position the current user holds this year, or null.
 */
async function getMyBoardPosition(
  userId: string,
  schoolId: string,
  schoolYear: string
): Promise<PtaBoardPosition | null> {
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear)
    ),
  });
  return (membership?.boardPosition as PtaBoardPosition | null) ?? null;
}

/**
 * Load a note and confirm the caller may change it.
 *
 * Authors own their words: only the person who wrote a note can edit it, and
 * only they can delete it. Board admins can archive (spam, duplicates, an AI
 * draft someone abandoned) but neither rewrite nor destroy someone else's
 * handoff.
 */
async function loadNoteForMutation(
  noteId: string,
  userId: string,
  schoolId: string
) {
  const note = await db.query.boardHandoffNotes.findFirst({
    where: and(
      eq(boardHandoffNotes.id, noteId),
      eq(boardHandoffNotes.schoolId, schoolId)
    ),
  });
  if (!note) throw new Error("Handoff note not found");

  const isAuthor = note.fromUserId === userId;
  const isAdmin = await isPtaBoardMember(userId, schoolId);

  return { note, isAuthor, isAdmin };
}

/**
 * Every live handoff note for a position, newest first.
 *
 * Notes accumulate rather than replace each other, so this is the full history
 * minus anything a board admin has archived. Callers that only want the current
 * default should take the first element.
 */
export async function getHandoffNotesForPosition(
  position: PtaBoardPosition
): Promise<BoardHandoffNoteForViewer[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const [notes, isAdmin] = await Promise.all([
    db.query.boardHandoffNotes.findMany({
      where: and(
        eq(boardHandoffNotes.schoolId, schoolId),
        eq(boardHandoffNotes.position, position),
        isNull(boardHandoffNotes.archivedAt)
      ),
      columns: NOTE_COLUMNS,
      with: NOTE_WITH_USERS,
      orderBy: NEWEST_FIRST,
    }),
    isPtaBoardMember(user.id!, schoolId),
  ]);

  return (notes as BoardHandoffNoteWithUsers[]).map((note) => {
    const isMine = note.fromUserId === user.id;
    return {
      ...note,
      isMine,
      canEdit: isMine,
      canDelete: isMine,
      canArchive: isMine || isAdmin,
    };
  });
}

/** A note is worth keeping when any section beyond the title says something. */
function hasContent(data: HandoffNoteInput): boolean {
  return Boolean(
    data.keyAccomplishments?.trim() ||
      data.ongoingProjects?.trim() ||
      data.tipsAndAdvice?.trim() ||
      data.importantContacts?.trim() ||
      data.filesAndResources?.trim()
  );
}

function revalidateHandoff() {
  revalidatePath("/onboarding");
  revalidatePath("/onboarding/handoff");
  revalidatePath("/admin/board/onboarding");
}

/**
 * Add a new handoff note for the current user's position.
 *
 * Always an INSERT. Notes accumulate rather than replace each other, so a
 * second person in the role — or the same person writing again later — never
 * overwrites work someone already did.
 */
export async function createHandoffNote(
  data: HandoffNoteInput
): Promise<{ success: boolean; noteId?: string; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const position = await getMyBoardPosition(user.id!, schoolId, schoolYear);
  if (!position) {
    return {
      success: false,
      error: "You must hold a PTA board position to create a handoff note",
    };
  }

  // Notes are append-only history, so an accidental empty save would sit in the
  // record permanently and pad the count the summary reports.
  if (!hasContent(data)) {
    return {
      success: false,
      error: "Fill in at least one section before saving this note",
    };
  }

  const [created] = await db
    .insert(boardHandoffNotes)
    .values({
      schoolId,
      position,
      schoolYear,
      fromUserId: user.id,
      source: "manual",
      ...data,
    })
    .returning({ id: boardHandoffNotes.id });

  revalidateHandoff();
  return { success: true, noteId: created.id };
}

/**
 * Edit an existing note. Author only — see loadNoteForMutation.
 */
export async function updateHandoffNote(
  noteId: string,
  data: HandoffNoteInput
): Promise<{ success: boolean; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const { isAuthor } = await loadNoteForMutation(noteId, user.id!, schoolId);
  if (!isAuthor) {
    return { success: false, error: "You can only edit notes you wrote" };
  }

  await db
    .update(boardHandoffNotes)
    .set({
      ...data,
      updatedAt: new Date(),
      // Content changed, so the stored embedding is stale. Nulling it puts the
      // note back in the queue the embedding backfill picks up.
      embedding: null,
    })
    .where(eq(boardHandoffNotes.id, noteId));

  revalidateHandoff();
  return { success: true };
}

/**
 * Hide a note from the position's handoff view. This is the right move for
 * board cleanup: a note is the only written trace of how a position was run
 * that year, and the AI guide generator reads years back.
 */
export async function archiveHandoffNote(
  noteId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const { isAuthor, isAdmin } = await loadNoteForMutation(
    noteId,
    user.id!,
    schoolId
  );
  if (!isAuthor && !isAdmin) {
    return { success: false, error: "You can only archive notes you wrote" };
  }

  await db
    .update(boardHandoffNotes)
    .set({ archivedAt: new Date(), archivedBy: user.id!, updatedAt: new Date() })
    .where(eq(boardHandoffNotes.id, noteId));

  revalidateHandoff();
  return { success: true };
}

export async function restoreHandoffNote(
  noteId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const { isAdmin, isAuthor } = await loadNoteForMutation(
    noteId,
    user.id!,
    schoolId
  );
  if (!isAuthor && !isAdmin) {
    return { success: false, error: "You can only restore notes you wrote" };
  }

  await db
    .update(boardHandoffNotes)
    .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(eq(boardHandoffNotes.id, noteId));

  revalidateHandoff();
  return { success: true };
}

/**
 * Permanently delete a note.
 *
 * Restricted to the author, whose case is discarding an AI draft they didn't
 * like — their own words, freshly written, nobody's institutional memory yet.
 * Board admins doing cleanup archive instead, so that someone else's account of
 * their year can't be erased by a later board.
 */
export async function deleteHandoffNote(
  noteId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const { isAuthor } = await loadNoteForMutation(noteId, user.id!, schoolId);
  if (!isAuthor) {
    return {
      success: false,
      error:
        "Only the person who wrote a handoff note can delete it. Archive it instead — that hides it without losing the record.",
    };
  }

  await db.delete(boardHandoffNotes).where(eq(boardHandoffNotes.id, noteId));

  revalidateHandoff();
  return { success: true };
}

/**
 * Admin: every handoff note for the school, across positions and years.
 */
export async function getAllHandoffNotes(): Promise<BoardHandoffNoteWithUsers[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const notes = await db.query.boardHandoffNotes.findMany({
    where: eq(boardHandoffNotes.schoolId, schoolId),
    columns: NOTE_COLUMNS,
    with: NOTE_WITH_USERS,
    orderBy: [
      desc(boardHandoffNotes.schoolYear),
      desc(boardHandoffNotes.position),
      desc(boardHandoffNotes.updatedAt),
    ],
  });

  return notes as BoardHandoffNoteWithUsers[];
}

/**
 * Turn raw bullet notes into a structured handoff note via AI, saved as a
 * BRAND-NEW note.
 *
 * Generation never touches an existing note. The author gets a draft they can
 * edit or delete, and anything they'd already written is still there untouched.
 */
export async function generateHandoffNoteFromRawNotes(
  rawNotes: string
): Promise<{
  success: boolean;
  noteId?: string;
  data?: GeneratedHandoffNote;
  error?: string;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const position = await getMyBoardPosition(user.id!, schoolId, schoolYear);
  if (!position) {
    return {
      success: false,
      error: "You must hold a PTA board position to generate handoff notes",
    };
  }

  if (!rawNotes.trim()) {
    return { success: false, error: "Paste some notes to generate from" };
  }

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { name: true },
  });

  try {
    const generated = await generateHandoffFromNotes({
      rawNotes,
      position,
      positionLabel: await getBoardPositionLabel(schoolId, position),
      schoolName: school?.name,
    });

    const [created] = await db
      .insert(boardHandoffNotes)
      .values({
        schoolId,
        position,
        schoolYear,
        fromUserId: user.id,
        source: "ai_generated",
        rawNotes,
        ...generated,
      })
      .returning({ id: boardHandoffNotes.id });

    revalidateHandoff();
    return { success: true, noteId: created.id, data: generated };
  } catch (error) {
    console.error("Failed to generate handoff notes:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate notes",
    };
  }
}

export type HandoffSummaryView = {
  content: HandoffSummaryContent;
  noteCount: number;
  yearRange: string | null;
  generatedAt: Date | null;
  /** True when notes have been written or edited since this summary was built. */
  isStale: boolean;
};

/**
 * The cached cross-year summary for a position, if one has been generated.
 */
export async function getHandoffSummary(
  position: PtaBoardPosition
): Promise<HandoffSummaryView | null> {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const [summary, notes] = await Promise.all([
    db.query.boardHandoffSummaries.findFirst({
      where: and(
        eq(boardHandoffSummaries.schoolId, schoolId),
        eq(boardHandoffSummaries.position, position)
      ),
    }),
    db.query.boardHandoffNotes.findMany({
      where: and(
        eq(boardHandoffNotes.schoolId, schoolId),
        eq(boardHandoffNotes.position, position),
        isNull(boardHandoffNotes.archivedAt)
      ),
      columns: { id: true, updatedAt: true },
    }),
  ]);

  if (!summary?.content) return null;

  let content: HandoffSummaryContent;
  try {
    content = JSON.parse(summary.content) as HandoffSummaryContent;
  } catch {
    return null;
  }

  const generatedAt = summary.generatedAt;
  const isStale =
    notes.length !== summary.noteCount ||
    (generatedAt
      ? notes.some((note) => (note.updatedAt ?? new Date(0)) > generatedAt)
      : true);

  return {
    content,
    noteCount: summary.noteCount,
    yearRange: summary.yearRange,
    generatedAt,
    isStale,
  };
}

/**
 * Build (or rebuild) the cross-year bullet summary for a position.
 *
 * Cached rather than generated per page load: it folds together every note ever
 * written for the role, so it's a real model call, and the answer only changes
 * when someone writes or edits a note.
 */
export async function generateHandoffSummary(
  position: PtaBoardPosition
): Promise<{ success: boolean; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const notes = await db.query.boardHandoffNotes.findMany({
    where: and(
      eq(boardHandoffNotes.schoolId, schoolId),
      eq(boardHandoffNotes.position, position),
      isNull(boardHandoffNotes.archivedAt)
    ),
    with: { fromUser: { columns: { name: true, email: true } } },
    orderBy: NEWEST_FIRST,
  });

  const notesWithContent = notes.filter(
    (note) =>
      note.keyAccomplishments ||
      note.ongoingProjects ||
      note.tipsAndAdvice ||
      note.importantContacts ||
      note.filesAndResources
  );

  if (notesWithContent.length === 0) {
    return { success: false, error: "There are no handoff notes to summarize" };
  }

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { name: true },
  });

  try {
    const content = await summarizeHandoffNotes({
      position,
      positionLabel: await getBoardPositionLabel(schoolId, position),
      schoolName: school?.name,
      notes: notesWithContent.map((note) => ({
        id: note.id,
        schoolYear: note.schoolYear,
        authorName: note.fromUser?.name ?? note.fromUser?.email,
        keyAccomplishments: note.keyAccomplishments,
        ongoingProjects: note.ongoingProjects,
        tipsAndAdvice: note.tipsAndAdvice,
        importantContacts: note.importantContacts,
        filesAndResources: note.filesAndResources,
      })),
    });

    // notesWithContent is newest-first, so last is the oldest year.
    const newestYear = notesWithContent[0].schoolYear;
    const oldestYear =
      notesWithContent[notesWithContent.length - 1].schoolYear;
    const yearRange =
      newestYear === oldestYear ? newestYear : `${oldestYear} – ${newestYear}`;

    const values = {
      content: JSON.stringify(content),
      sourceNoteIds: JSON.stringify(notesWithContent.map((n) => n.id)),
      // Counted against ALL notes, not just the ones with content, so that
      // adding an empty note doesn't leave the summary looking permanently stale.
      noteCount: notes.length,
      yearRange,
      generatedAt: new Date(),
      generatedBy: user.id,
    };

    await db
      .insert(boardHandoffSummaries)
      .values({ schoolId, position, ...values })
      .onConflictDoUpdate({
        target: [boardHandoffSummaries.schoolId, boardHandoffSummaries.position],
        set: values,
      });

    revalidateHandoff();
    return { success: true };
  } catch (error) {
    console.error("Failed to summarize handoff notes:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to summarize handoff notes",
    };
  }
}
