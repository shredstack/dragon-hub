"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { savedQuestions } from "@/lib/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { QASource } from "@/actions/knowledge-qa";

export type SavedQaVisibility = "shared" | "private";

export interface SavedQa {
  id: string;
  question: string;
  answer: string;
  title: string | null;
  confidence: string | null;
  sources: QASource[];
  visibility: SavedQaVisibility;
  createdAt: Date | null;
  createdBy: string | null;
  creatorName: string | null;
  /** Whether the current viewer may edit or delete this entry. */
  canManage: boolean;
}

/**
 * Everyone who can save a Q&A can also read the shared ones, so both paths
 * share the same gate: the Q&A feature itself is board/admin only.
 */
async function assertQaAccess() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  return { userId: user.id!, schoolId };
}

/**
 * Save an answer from "Ask DragonHub" so it doesn't have to be asked again.
 * Shared by default — a private save is the deliberate choice.
 */
export async function saveQa(data: {
  question: string;
  answer: string;
  sources?: QASource[];
  confidence?: string;
  title?: string;
  visibility?: SavedQaVisibility;
}) {
  const { userId, schoolId } = await assertQaAccess();

  const question = data.question.trim();
  const answer = data.answer.trim();
  if (!question || !answer) throw new Error("Question and answer are required");

  const [saved] = await db
    .insert(savedQuestions)
    .values({
      schoolId,
      question,
      answer,
      sources: data.sources ?? [],
      confidence: data.confidence ?? null,
      title: data.title?.trim() || null,
      visibility: data.visibility ?? "shared",
      createdBy: userId,
    })
    .returning({ id: savedQuestions.id });

  revalidatePath("/knowledge");
  return saved;
}

/**
 * Shared entries for the whole school, plus the viewer's own private ones.
 */
export async function getSavedQas(options?: {
  search?: string;
}): Promise<SavedQa[]> {
  const { userId, schoolId } = await assertQaAccess();

  const rows = await db.query.savedQuestions.findMany({
    where: and(
      eq(savedQuestions.schoolId, schoolId),
      or(
        eq(savedQuestions.visibility, "shared"),
        and(
          eq(savedQuestions.visibility, "private"),
          eq(savedQuestions.createdBy, userId)
        )
      )!
    ),
    orderBy: [desc(savedQuestions.createdAt)],
    with: { creator: { columns: { name: true } } },
  });

  // Filtered in memory rather than SQL: the list is small (one school's saved
  // answers) and searching the answer body with ilike would need an index to
  // stay honest as it grows.
  const term = options?.search?.trim().toLowerCase();
  const matched = term
    ? rows.filter(
        (r) =>
          r.question.toLowerCase().includes(term) ||
          r.answer.toLowerCase().includes(term) ||
          r.title?.toLowerCase().includes(term)
      )
    : rows;

  return matched.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    title: r.title,
    confidence: r.confidence,
    sources: (r.sources ?? []) as unknown as QASource[],
    visibility: r.visibility as SavedQaVisibility,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    creatorName: r.creator?.name ?? null,
    canManage: r.createdBy === userId,
  }));
}

/**
 * Look up one saved entry the viewer is allowed to change. Ownership, not
 * board membership: a shared answer stays as the person who vouched for it
 * left it.
 */
async function assertOwnedQa(id: string) {
  const { userId, schoolId } = await assertQaAccess();

  const existing = await db.query.savedQuestions.findFirst({
    where: and(eq(savedQuestions.id, id), eq(savedQuestions.schoolId, schoolId)),
  });
  if (!existing) throw new Error("Saved Q&A not found");
  if (existing.createdBy !== userId) {
    throw new Error("Unauthorized: You can only change Q&As you saved");
  }
  return existing;
}

export async function updateSavedQa(
  id: string,
  data: { title?: string | null; visibility?: SavedQaVisibility }
) {
  await assertOwnedQa(id);

  await db
    .update(savedQuestions)
    .set({
      ...(data.title !== undefined ? { title: data.title?.trim() || null } : {}),
      ...(data.visibility ? { visibility: data.visibility } : {}),
      updatedAt: new Date(),
    })
    .where(eq(savedQuestions.id, id));

  revalidatePath("/knowledge");
}

export async function deleteSavedQa(id: string) {
  await assertOwnedQa(id);
  await db.delete(savedQuestions).where(eq(savedQuestions.id, id));
  revalidatePath("/knowledge");
}
