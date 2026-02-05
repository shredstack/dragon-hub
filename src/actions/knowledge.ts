"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { knowledgeArticles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createArticle(data: {
  title: string;
  description: string;
  googleDriveUrl: string;
  category: string;
  tags: string[];
  schoolYear?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await db.insert(knowledgeArticles).values({
    schoolId,
    title: data.title,
    description: data.description,
    googleDriveUrl: data.googleDriveUrl,
    category: data.category,
    tags: data.tags,
    schoolYear: data.schoolYear || null,
    createdBy: user.id!,
  });

  revalidatePath("/knowledge");
}

export async function updateArticle(
  id: string,
  data: { title?: string; description?: string; googleDriveUrl?: string; category?: string; tags?: string[] }
) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Only update article if it belongs to current school
  await db
    .update(knowledgeArticles)
    .set({ ...data, lastUpdated: new Date() })
    .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.schoolId, schoolId)));

  revalidatePath("/knowledge");
}

export async function deleteArticle(id: string) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Only delete article if it belongs to current school
  await db
    .delete(knowledgeArticles)
    .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.schoolId, schoolId)));

  revalidatePath("/knowledge");
}
