"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertPtaBoardMember,
} from "@/lib/auth-helpers";
import { db, dbPool } from "@/lib/db";
import {
  committees,
  driveFileIndex,
  knowledgeArticleAudiences,
  knowledgeArticles,
} from "@/lib/db/schema";
import { eq, and, asc, desc, ilike, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  articleVisibilityCondition,
  canViewArticle,
  getViewerAudience,
  toAudienceRows,
  type AudienceGrant,
} from "@/lib/knowledge-audience";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { normalizeTags } from "@/lib/tags";
import { ensureTagsExist, syncTagUsage } from "@/lib/tag-usage";

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

/** Audience rows, plus the committee name a chip needs to render. */
const AUDIENCE_WITH = {
  columns: {
    audienceType: true,
    volunteerRole: true,
    committeeId: true,
  },
  with: {
    committee: { columns: { name: true, iconEmoji: true } },
  },
} as const;

/**
 * Get the articles the current user is allowed to see.
 *
 * The board and school admins get everything, at any status. Everyone else
 * gets published articles explicitly shared with a role they hold — see
 * `src/lib/knowledge-audience.ts` for why an untagged article is board-only.
 */
export async function getArticles(options?: {
  status?: "draft" | "published" | "archived";
  category?: string;
  search?: string;
  /** Board-only: narrow to articles shared with one committee. */
  committeeId?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const viewer = await getViewerAudience(user.id!, schoolId);

  const conditions = [eq(knowledgeArticles.schoolId, schoolId)];

  const visibility = articleVisibilityCondition(viewer);
  if (visibility) conditions.push(visibility);

  // A status filter from a non-board caller can only ever narrow further —
  // `articleVisibilityCondition` has already pinned them to published.
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

  const articles = await db.query.knowledgeArticles.findMany({
    where: and(...conditions),
    orderBy: [desc(knowledgeArticles.updatedAt)],
    with: {
      creator: { columns: { name: true } },
      sourceMinutes: { columns: { fileName: true, meetingDate: true } },
      audiences: AUDIENCE_WITH,
    },
  });

  if (!options?.committeeId) return articles;
  return articles.filter((a) =>
    a.audiences.some((aud) => aud.committeeId === options.committeeId)
  );
}

/**
 * Get a single article by slug.
 *
 * Returns null when the article exists but isn't shared with this user, so
 * callers `notFound()` rather than leaking that it exists at all.
 */
export async function getArticleBySlug(slug: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const article = await db.query.knowledgeArticles.findFirst({
    where: and(
      eq(knowledgeArticles.schoolId, schoolId),
      eq(knowledgeArticles.slug, slug)
    ),
    with: {
      creator: { columns: { name: true, email: true } },
      sourceMinutes: true,
      audiences: AUDIENCE_WITH,
    },
  });

  if (!article) return null;

  const viewer = await getViewerAudience(user.id!, schoolId);
  const allowed = await canViewArticle(viewer, article, article.audiences);
  return allowed ? article : null;
}

/**
 * Everything the audience picker needs to render: the fixed volunteer roles
 * plus this school's active committees for the current year.
 */
export async function getAudienceOptions(): Promise<{
  committees: Array<{ id: string; name: string; iconEmoji: string | null }>;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);

  const rows = await db.query.committees.findMany({
    where: and(
      eq(committees.schoolId, schoolId),
      eq(committees.schoolYear, schoolYear),
      isNull(committees.archivedAt)
    ),
    columns: { id: true, name: true, iconEmoji: true },
    orderBy: [asc(committees.sortOrder), asc(committees.name)],
  });

  return { committees: rows };
}

/**
 * Replace an article's audience grants wholesale.
 *
 * Board-only, and deliberately a replace rather than an add/remove pair: the
 * picker is a checklist, so "what's checked" is the whole truth and a partial
 * update would need the client to diff correctly to stay safe.
 */
export async function setArticleAudiences(
  articleId: string,
  grants: AudienceGrant[]
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const article = await db.query.knowledgeArticles.findFirst({
    where: and(
      eq(knowledgeArticles.id, articleId),
      eq(knowledgeArticles.schoolId, schoolId)
    ),
    columns: { id: true, slug: true },
  });
  if (!article) throw new Error("Article not found");

  const rows = toAudienceRows(article.id, grants, user.id!);

  // A committee id arriving from the client is validated against this school
  // before it can grant anything — otherwise a hand-crafted call could share
  // an article with a committee at a different school.
  const committeeIds = rows
    .map((r) => r.committeeId)
    .filter((id): id is string => id !== null);
  if (committeeIds.length > 0) {
    const valid = await db.query.committees.findMany({
      where: and(
        eq(committees.schoolId, schoolId),
        inArray(committees.id, committeeIds)
      ),
      columns: { id: true },
    });
    if (valid.length !== committeeIds.length) {
      throw new Error("One or more committees are not part of this school");
    }
  }

  // dbPool, not db: replacing the grants has to be atomic (a failed insert
  // after the delete would silently un-share the article), and the neon-http
  // driver throws "No transactions support" on `db.transaction`.
  await dbPool.transaction(async (tx) => {
    await tx
      .delete(knowledgeArticleAudiences)
      .where(eq(knowledgeArticleAudiences.articleId, article.id));
    if (rows.length > 0) {
      await tx.insert(knowledgeArticleAudiences).values(rows);
    }
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${article.slug}`);
  revalidatePath("/committees");
}

/**
 * Published articles shared with one committee, for its workspace.
 *
 * Scoped to grants naming *this* committee — deliberately not including
 * "Everyone" articles, which are already one click away in the Knowledge Base.
 * A Resources tab that repeats the whole library is a tab nobody opens twice.
 *
 * Guarded by `assertCommitteeAccess` rather than the article audience
 * predicate: if you're on the committee you hold the role by definition, and
 * the assert also covers the board, who see every committee.
 */
export async function getCommitteeResources(committeeId: string) {
  const user = await assertAuthenticated();
  const { assertCommitteeAccess } = await import("@/lib/auth-helpers");
  await assertCommitteeAccess(user.id!, committeeId);

  const rows = await db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      summary: knowledgeArticles.summary,
      category: knowledgeArticles.category,
      updatedAt: knowledgeArticles.updatedAt,
    })
    .from(knowledgeArticles)
    .innerJoin(
      knowledgeArticleAudiences,
      eq(knowledgeArticleAudiences.articleId, knowledgeArticles.id)
    )
    .where(
      and(
        eq(knowledgeArticleAudiences.committeeId, committeeId),
        eq(knowledgeArticles.status, "published")
      )
    )
    .orderBy(desc(knowledgeArticles.updatedAt));

  return rows;
}

/**
 * Files attached to an article, for anyone allowed to read the article.
 *
 * This is how uploads reach a role: the board attaches a PDF to an article and
 * the article's audience governs the file, so there is exactly one place where
 * "who can see this" is decided.
 */
export async function getArticleAttachments(articleSlug: string) {
  const article = await getArticleBySlug(articleSlug);
  if (!article) return [];

  const rows = await db.query.driveFileIndex.findMany({
    where: and(
      eq(driveFileIndex.knowledgeArticleId, article.id),
      eq(driveFileIndex.schoolId, article.schoolId)
    ),
    columns: {
      id: true,
      fileName: true,
      title: true,
      mimeType: true,
      fileSize: true,
      source: true,
      blobUrl: true,
      webUrl: true,
      processingStatus: true,
    },
    orderBy: [asc(driveFileIndex.fileName)],
  });

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    title: r.title,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    source: r.source,
    url: r.blobUrl ?? r.webUrl ?? undefined,
    processingStatus: r.processingStatus,
  }));
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
  /** Omitted or empty means board / school admin only. */
  audiences?: AudienceGrant[];
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Authoring is a board action now that an article's audience decides who
  // reads it: a member-authored article would default to board-only and be
  // invisible to the person who just wrote it.
  await assertPtaBoardMember(user.id!, schoolId);

  const slug = await generateUniqueSlug(schoolId, data.title);

  // Stored normalized so an article tagged "Book Fair" is found by the school's
  // "book fair" tag; see src/lib/tags.ts.
  const tags = normalizeTags(data.tags);

  const [article] = await db
    .insert(knowledgeArticles)
    .values({
      schoolId,
      title: data.title,
      slug,
      body: data.body,
      summary: data.summary,
      category: data.category,
      tags,
      googleDriveUrl: data.googleDriveUrl,
      schoolYear: data.schoolYear,
      sourceMinutesId: data.sourceMinutesId,
      aiGenerated: data.aiGenerated ?? false,
      status: data.status ?? "draft",
      publishedAt: data.status === "published" ? new Date() : null,
      createdBy: user.id!,
    })
    .returning();

  if (data.audiences && data.audiences.length > 0) {
    await setArticleAudiences(article.id, data.audiences);
  }

  // A tag typed into the picker becomes part of the school's vocabulary here,
  // the same way it does for events, contacts and media.
  if (tags.length > 0) await ensureTagsExist(tags);

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
    /** Replaces the article's grants wholesale when present. */
    audiences?: AudienceGrant[];
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await assertPtaBoardMember(user.id!, schoolId);

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

  const { audiences, ...columns } = data;
  const tags = data.tags ? normalizeTags(data.tags) : undefined;

  await db
    .update(knowledgeArticles)
    .set({
      ...columns,
      tags,
      slug: newSlug,
      publishedAt: data.status === "published" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(knowledgeArticles.id, current.id));

  if (audiences) {
    await setArticleAudiences(current.id, audiences);
  }

  // Keeps usage counts honest in both directions, so a tag dropped from the
  // last article that used it stops topping the picker's suggestions.
  if (tags) await syncTagUsage(current.tags, tags);

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

  await assertPtaBoardMember(user.id!, schoolId);

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

  await assertPtaBoardMember(user.id!, schoolId);

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

  await assertPtaBoardMember(user.id!, schoolId);

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

  await assertPtaBoardMember(user.id!, schoolId);

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

  await assertPtaBoardMember(user.id!, schoolId);

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
