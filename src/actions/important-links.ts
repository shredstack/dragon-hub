"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { importantLinks } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  normalizeLinkUrl,
  type ImportantLink,
  type LinkOpenMode,
} from "@/lib/important-links-shared";

/**
 * The board's curated links: read by everyone at the school, written by the
 * board. The list leads the dashboard, so every mutation has to refresh it.
 */

const OPEN_MODES: LinkOpenMode[] = ["new_tab", "in_app"];

function revalidateLinkPages() {
  revalidatePath("/dashboard");
  revalidatePath("/admin/board/links");
  revalidatePath("/admin/board");
}

async function assertBoardAccess() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  return { user, schoolId };
}

function toLink(row: typeof importantLinks.$inferSelect): ImportantLink {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    iconEmoji: row.iconEmoji,
    openMode: (OPEN_MODES as string[]).includes(row.openMode)
      ? (row.openMode as LinkOpenMode)
      : "new_tab",
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

interface LinkInput {
  title: string;
  description?: string | null;
  url: string;
  iconEmoji?: string | null;
  openMode?: LinkOpenMode;
}

/** Validate and clean what the form sent, or throw with something readable. */
function parseInput(input: LinkInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Give the link a name");

  const url = normalizeLinkUrl(input.url);
  if (!url) {
    throw new Error(
      "That doesn't look like a web address — it should start with https://"
    );
  }

  const openMode: LinkOpenMode =
    input.openMode && OPEN_MODES.includes(input.openMode)
      ? input.openMode
      : "new_tab";

  return {
    title,
    url,
    openMode,
    description: input.description?.trim() || null,
    iconEmoji: input.iconEmoji?.trim() || null,
  };
}

/** What families see on the dashboard: the active links, in the board's order. */
export async function getImportantLinks(
  schoolId: string
): Promise<ImportantLink[]> {
  const rows = await db
    .select()
    .from(importantLinks)
    .where(
      and(
        eq(importantLinks.schoolId, schoolId),
        eq(importantLinks.active, true)
      )
    )
    .orderBy(asc(importantLinks.sortOrder), asc(importantLinks.createdAt));

  return rows.map(toLink);
}

/** The admin list — includes the links the board has turned off. */
export async function listImportantLinks(): Promise<ImportantLink[]> {
  const { schoolId } = await assertBoardAccess();

  const rows = await db
    .select()
    .from(importantLinks)
    .where(eq(importantLinks.schoolId, schoolId))
    .orderBy(asc(importantLinks.sortOrder), asc(importantLinks.createdAt));

  return rows.map(toLink);
}

export async function createImportantLink(input: LinkInput) {
  const { user, schoolId } = await assertBoardAccess();
  const values = parseInput(input);

  // New links land at the bottom, where the board put the last one.
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${importantLinks.sortOrder}), -1) + 1` })
    .from(importantLinks)
    .where(eq(importantLinks.schoolId, schoolId));

  const [row] = await db
    .insert(importantLinks)
    .values({
      schoolId,
      ...values,
      sortOrder: Number(next) || 0,
      createdBy: user.id!,
    })
    .returning();

  revalidateLinkPages();
  return toLink(row);
}

export async function updateImportantLink(linkId: string, input: LinkInput) {
  const { schoolId } = await assertBoardAccess();
  const values = parseInput(input);

  const [row] = await db
    .update(importantLinks)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(eq(importantLinks.id, linkId), eq(importantLinks.schoolId, schoolId))
    )
    .returning();

  if (!row) throw new Error("Link not found");

  revalidateLinkPages();
  return toLink(row);
}

/**
 * Turning a link off is the reversible way to take it down — a spirit wear
 * store that only runs in October comes back every year.
 */
export async function setImportantLinkActive(linkId: string, active: boolean) {
  const { schoolId } = await assertBoardAccess();

  await db
    .update(importantLinks)
    .set({ active, updatedAt: new Date() })
    .where(
      and(eq(importantLinks.id, linkId), eq(importantLinks.schoolId, schoolId))
    );

  revalidateLinkPages();
  return { success: true };
}

export async function deleteImportantLink(linkId: string) {
  const { schoolId } = await assertBoardAccess();

  await db
    .delete(importantLinks)
    .where(
      and(eq(importantLinks.id, linkId), eq(importantLinks.schoolId, schoolId))
    );

  revalidateLinkPages();
  return { success: true };
}

/** Order matters here: the first two or three are the ones anyone reads. */
export async function reorderImportantLinks(orderedIds: string[]) {
  const { schoolId } = await assertBoardAccess();

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(importantLinks)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(
          and(
            eq(importantLinks.id, id),
            eq(importantLinks.schoolId, schoolId)
          )
        )
    )
  );

  revalidateLinkPages();
  return { success: true };
}
