"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { knowledgeArticles } from "@/lib/db/schema";
import { eq, and, desc, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Generate a URL-friendly slug from a title.
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/**
 * Generate a unique slug by checking for collisions.
 */
async function generateUniqueSlug(
  schoolId: string,
  title: string,
  excludeId?: string
): Promise<string> {
  const baseSlug = generateSlug(title);

  const conditions = [
    eq(knowledgeArticles.schoolId, schoolId),
    eq(knowledgeArticles.slug, baseSlug),
  ];
  if (excludeId) {
    // When updating, exclude current article from collision check
    // This is handled differently - we check after filtering
  }

  const existing = await db.query.knowledgeArticles.findFirst({
    where: and(...conditions),
  });

  if (!existing || (excludeId && existing.id === excludeId)) {
    return baseSlug;
  }

  // Append number to make unique
  let counter = 2;
  let slug = `${baseSlug}-${counter}`;
  while (true) {
    const check = await db.query.knowledgeArticles.findFirst({
      where: and(
        eq(knowledgeArticles.schoolId, schoolId),
        eq(knowledgeArticles.slug, slug)
      ),
    });
    if (!check || (excludeId && check.id === excludeId)) {
      return slug;
    }
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Get all articles for the current school.
 */
export async function getArticles(options?: {
  status?: "draft" | "published" | "archived";
  category?: string;
  search?: string;
}) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const conditions = [eq(knowledgeArticles.schoolId, schoolId)];

  if (options?.status) {
    conditions.push(eq(knowledgeArticles.status, options.status));
  }
  if (options?.category) {
    conditions.push(eq(knowledgeArticles.category, options.category));
  }
  if (options?.search) {
    conditions.push(
      or(
        ilike(knowledgeArticles.title, `%${options.search}%`),
        ilike(knowledgeArticles.summary, `%${options.search}%`)
      )!
    );
  }

  return db.query.knowledgeArticles.findMany({
    where: and(...conditions),
    orderBy: [desc(knowledgeArticles.updatedAt)],
    with: {
      creator: { columns: { name: true } },
      sourceMinutes: { columns: { fileName: true, meetingDate: true } },
    },
  });
}

/**
 * Get a single article by slug.
 */
export async function getArticleBySlug(slug: string) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  return db.query.knowledgeArticles.findFirst({
    where: and(
      eq(knowledgeArticles.schoolId, schoolId),
      eq(knowledgeArticles.slug, slug)
    ),
    with: {
      creator: { columns: { name: true, email: true } },
      sourceMinutes: true,
    },
  });
}

/**
 * Create a new article.
 */
export async function createArticle(data: {
  title: string;
  body: string;
  summary?: string;
  category?: string;
  tags?: string[];
  googleDriveUrl?: string;
  schoolYear?: string;
  sourceMinutesId?: string;
  aiGenerated?: boolean;
  status?: "draft" | "published";
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const slug = await generateUniqueSlug(schoolId, data.title);

  const [article] = await db
    .insert(knowledgeArticles)
    .values({
      schoolId,
      title: data.title,
      slug,
      body: data.body,
      summary: data.summary,
      category: data.category,
      tags: data.tags,
      googleDriveUrl: data.googleDriveUrl,
      schoolYear: data.schoolYear,
      sourceMinutesId: data.sourceMinutesId,
      aiGenerated: data.aiGenerated ?? false,
      status: data.status ?? "draft",
      publishedAt: data.status === "published" ? new Date() : null,
      createdBy: user.id!,
    })
    .returning();

  revalidatePath("/knowledge");
  return article;
}

/**
 * Update an existing article.
 */
export async function updateArticle(
  slug: string,
  data: {
    title?: string;
    body?: string;
    summary?: string;
    category?: string;
    tags?: string[];
    googleDriveUrl?: string;
    status?: "draft" | "published" | "archived";
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get current article to check for slug changes
  const current = await db.query.knowledgeArticles.findFirst({
    where: and(
      eq(knowledgeArticles.schoolId, schoolId),
      eq(knowledgeArticles.slug, slug)
    ),
  });

  if (!current) {
    throw new Error("Article not found");
  }

  // Generate new slug if title changed
  let newSlug: string | undefined;
  if (data.title && data.title !== current.title) {
    newSlug = await generateUniqueSlug(schoolId, data.title, current.id);
  }

  await db
    .update(knowledgeArticles)
    .set({
      ...data,
      slug: newSlug,
      publishedAt: data.status === "published" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticles.id, current.id));

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${newSlug || slug}`);

  return { slug: newSlug || slug };
}

/**
 * Publish an article.
 */
export async function publishArticle(slug: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await db
    .update(knowledgeArticles)
    .set({
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeArticles.schoolId, schoolId),
        eq(knowledgeArticles.slug, slug)
      )
    );

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${slug}`);
}

/**
 * Archive an article.
 */
export async function archiveArticle(slug: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await db
    .update(knowledgeArticles)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeArticles.schoolId, schoolId),
        eq(knowledgeArticles.slug, slug)
      )
    );

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${slug}`);
}

/**
 * Delete an article.
 * Requires PTA board role.
 */
export async function deleteArticle(slug: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.schoolId, schoolId),
        eq(knowledgeArticles.slug, slug)
      )
    );

  revalidatePath("/knowledge");
}

/**
 * Extract knowledge articles from meeting minutes using AI.
 */
export async function extractFromMinutes(minutesId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get the minutes
  const { ptaMinutes } = await import("@/lib/db/schema");
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

  // Get existing article titles to avoid duplicates
  const existingArticles = await db.query.knowledgeArticles.findMany({
    where: eq(knowledgeArticles.schoolId, schoolId),
    columns: { title: true },
  });
  const existingTitles = existingArticles.map((a) => a.title);

  // Extract knowledge using AI
  const { extractKnowledgeFromMinutes } = await import(
    "@/lib/ai/minutes-to-articles"
  );
  const result = await extractKnowledgeFromMinutes(
    minutes.textContent,
    minutes.meetingDate,
    existingTitles
  );

  return result;
}

/**
 * Save extracted articles as drafts.
 */
export async function saveExtractedArticles(
  minutesId: string,
  articles: Array<{
    title: string;
    summary: string;
    body: string;
    category: string;
    tags: string[];
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const savedArticles = [];

  for (const article of articles) {
    const slug = await generateUniqueSlug(schoolId, article.title);

    const [saved] = await db
      .insert(knowledgeArticles)
      .values({
        schoolId,
        title: article.title,
        slug,
        summary: article.summary,
        body: article.body,
        category: article.category,
        tags: article.tags,
        sourceMinutesId: minutesId,
        aiGenerated: true,
        status: "draft",
        createdBy: user.id!,
      })
      .returning();

    savedArticles.push(saved);
  }

  revalidatePath("/knowledge");
  return savedArticles;
}
