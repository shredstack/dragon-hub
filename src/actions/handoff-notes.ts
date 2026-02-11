"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  boardHandoffNotes,
  schoolMemberships,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { PtaBoardPosition, BoardHandoffNoteWithUsers } from "@/types";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

export type HandoffNoteInput = {
  keyAccomplishments?: string | null;
  ongoingProjects?: string | null;
  tipsAndAdvice?: string | null;
  importantContacts?: string | null;
  filesAndResources?: string | null; // JSON array string
};

/**
 * Get the handoff note for the current user's position
 * Returns the note they're writing for the next person
 */
export async function getMyHandoffNote() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get the user's current position
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (!membership?.boardPosition) {
    return null;
  }

  // Find or return the handoff note for this position/year
  const note = await db.query.boardHandoffNotes.findFirst({
    where: and(
      eq(boardHandoffNotes.schoolId, schoolId),
      eq(boardHandoffNotes.position, membership.boardPosition),
      eq(boardHandoffNotes.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
    with: {
      fromUser: { columns: { id: true, name: true, email: true } },
      toUser: { columns: { id: true, name: true, email: true } },
    },
  });

  return note;
}

/**
 * Save or update the handoff note for the current user's position
 */
export async function saveHandoffNote(data: HandoffNoteInput) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get the user's current position
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (!membership?.boardPosition) {
    throw new Error("You must hold a PTA board position to create a handoff note");
  }

  // Check if note already exists
  const existing = await db.query.boardHandoffNotes.findFirst({
    where: and(
      eq(boardHandoffNotes.schoolId, schoolId),
      eq(boardHandoffNotes.position, membership.boardPosition),
      eq(boardHandoffNotes.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (existing) {
    // Update existing note
    await db
      .update(boardHandoffNotes)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(boardHandoffNotes.id, existing.id));
  } else {
    // Create new note
    await db.insert(boardHandoffNotes).values({
      schoolId,
      position: membership.boardPosition,
      schoolYear: CURRENT_SCHOOL_YEAR,
      fromUserId: user.id,
      ...data,
    });
  }

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/handoff");
  return { success: true };
}

/**
 * Get handoff notes for a specific position (for incoming board members)
 * Returns notes from previous years for that position
 */
export async function getHandoffNotesForPosition(
  position: PtaBoardPosition
): Promise<BoardHandoffNoteWithUsers[]> {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const notes = await db.query.boardHandoffNotes.findMany({
    where: and(
      eq(boardHandoffNotes.schoolId, schoolId),
      eq(boardHandoffNotes.position, position)
    ),
    with: {
      fromUser: { columns: { id: true, name: true, email: true } },
      toUser: { columns: { id: true, name: true, email: true } },
    },
    orderBy: [desc(boardHandoffNotes.schoolYear)],
    limit: 5, // Get last 5 years of notes
  });

  return notes as BoardHandoffNoteWithUsers[];
}

/**
 * Get handoff notes for the current user's position (what predecessors wrote)
 * This is for onboarding new board members
 */
export async function getMyPositionHandoffNotes(): Promise<BoardHandoffNoteWithUsers[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get the user's current position
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (!membership?.boardPosition) {
    return [];
  }

  // Get notes from previous years (excluding current year - that's the one they're writing)
  const notes = await db.query.boardHandoffNotes.findMany({
    where: and(
      eq(boardHandoffNotes.schoolId, schoolId),
      eq(boardHandoffNotes.position, membership.boardPosition)
    ),
    with: {
      fromUser: { columns: { id: true, name: true, email: true } },
      toUser: { columns: { id: true, name: true, email: true } },
    },
    orderBy: [desc(boardHandoffNotes.schoolYear)],
    limit: 3, // Get last 3 years of notes for context
  });

  // Filter out current year
  return notes.filter(
    (note) => note.schoolYear !== CURRENT_SCHOOL_YEAR
  ) as BoardHandoffNoteWithUsers[];
}

/**
 * Admin: Get all handoff notes for the school
 */
export async function getAllHandoffNotes(): Promise<BoardHandoffNoteWithUsers[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const notes = await db.query.boardHandoffNotes.findMany({
    where: eq(boardHandoffNotes.schoolId, schoolId),
    with: {
      fromUser: { columns: { id: true, name: true, email: true } },
      toUser: { columns: { id: true, name: true, email: true } },
    },
    orderBy: [desc(boardHandoffNotes.schoolYear), desc(boardHandoffNotes.position)],
  });

  return notes as BoardHandoffNoteWithUsers[];
}

/**
 * Admin: Delete a handoff note
 */
export async function deleteHandoffNote(noteId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(boardHandoffNotes)
    .where(
      and(
        eq(boardHandoffNotes.id, noteId),
        eq(boardHandoffNotes.schoolId, schoolId)
      )
    );

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/handoff");
  revalidatePath("/admin/board/onboarding");
  return { success: true };
}
