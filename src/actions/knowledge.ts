"use server";

import { assertAuthenticated } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { knowledgeArticles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

  await db.insert(knowledgeArticles).values({
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

  await db
    .update(knowledgeArticles)
    .set({ ...data, lastUpdated: new Date() })
    .where(eq(knowledgeArticles.id, id));

  revalidatePath("/knowledge");
}

export async function deleteArticle(id: string) {
  await assertAuthenticated();

  await db.delete(knowledgeArticles).where(eq(knowledgeArticles.id, id));

  revalidatePath("/knowledge");
}
