/**
 * Knowledge Base audience targeting.
 *
 * A Knowledge Base article carries zero or more audience grants
 * (`knowledge_article_audiences`). The rule, in one sentence:
 *
 *   The board and school admins see everything; everyone else sees a published
 *   article only when one of its grants names a role they actually hold.
 *
 * **No grants means board / school admin only.** That is the fail-closed
 * default the PTA asked for: an article nobody has thought about the audience
 * for is internal, and sharing is always a deliberate act. "Everyone at the
 * school" is a real grant you check, not the absence of one.
 *
 * Not a `"use server"` module — it exports predicates and plain helpers that
 * server actions compose into their own queries.
 */

import { cache } from "react";
import type {
  AudienceGrant,
  VolunteerRole,
} from "@/lib/knowledge-audience-shared";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  classrooms,
  committeeMembers,
  committees,
  knowledgeArticleAudiences,
  knowledgeArticles,
  users,
  volunteerSignups,
} from "@/lib/db/schema";
import { isSchoolPtaBoardOrAdmin } from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";

export type { VolunteerRole, AudienceGrant } from "@/lib/knowledge-audience-shared";
export {
  VOLUNTEER_ROLE_LABELS,
  describeAudiences,
  toAudienceGrants,
} from "@/lib/knowledge-audience-shared";

/** Every role the viewer holds, resolved once per request. */
export interface ViewerAudience {
  /** Board and school admins bypass audience filtering entirely. */
  isBoardOrAdmin: boolean;
  volunteerRoles: VolunteerRole[];
  committeeIds: string[];
}

/**
 * Resolve which audiences a user falls into at a school.
 *
 * Volunteer roles come from `volunteer_signups` rather than the derived
 * `classroom_members` table on purpose: the signup row is the record of *what
 * they volunteered as*, and `classroom_members.role` flattens party volunteers
 * into the generic `volunteer` role, which would make "party volunteers" an
 * audience nobody could ever match.
 *
 * The email fallback alongside `user_id` covers the window before
 * `linkVolunteerSignupsToUser` has backfilled the link — a parent who signs up
 * at Back to School Night and reads the handbook that evening should not have
 * to wait on a sign-in event.
 */
export const getViewerAudience = cache(async function getViewerAudience(
  userId: string,
  schoolId: string
): Promise<ViewerAudience> {
  const isBoardOrAdmin = await isSchoolPtaBoardOrAdmin(userId, schoolId);
  if (isBoardOrAdmin) {
    return { isBoardOrAdmin: true, volunteerRoles: [], committeeIds: [] };
  }

  const [schoolYear, account] = await Promise.all([
    getSchoolCurrentYear(schoolId),
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    }),
  ]);

  const identifies = account?.email
    ? or(
        eq(volunteerSignups.userId, userId),
        sql`lower(${volunteerSignups.email}) = ${account.email.toLowerCase()}`
      )
    : eq(volunteerSignups.userId, userId);

  const [roleRows, committeeRows] = await Promise.all([
    db
      .selectDistinct({ role: volunteerSignups.role })
      .from(volunteerSignups)
      .innerJoin(classrooms, eq(classrooms.id, volunteerSignups.classroomId))
      .where(
        and(
          eq(volunteerSignups.schoolId, schoolId),
          eq(volunteerSignups.status, "active"),
          eq(classrooms.schoolYear, schoolYear),
          identifies
        )
      ),
    // Not filtered to the current school year: committees are year-scoped rows,
    // so last year's membership only ever matches last year's committee — and
    // material shared with that committee stays reachable to the people who
    // did the work, which is the point of institutional knowledge.
    db
      .selectDistinct({ committeeId: committeeMembers.committeeId })
      .from(committeeMembers)
      .innerJoin(committees, eq(committees.id, committeeMembers.committeeId))
      .where(
        and(
          eq(committeeMembers.userId, userId),
          eq(committees.schoolId, schoolId),
          isNull(committees.archivedAt)
        )
      ),
  ]);

  return {
    isBoardOrAdmin: false,
    volunteerRoles: roleRows.map((r) => r.role as VolunteerRole),
    committeeIds: committeeRows.map((r) => r.committeeId),
  };
});

/**
 * A SQL condition selecting the articles this viewer may see, for composition
 * into any `knowledge_articles` query.
 *
 * Returns `undefined` for the board — "no extra condition" rather than a
 * tautology, so board queries stay exactly the shape they were.
 */
export function articleVisibilityCondition(viewer: ViewerAudience) {
  if (viewer.isBoardOrAdmin) return undefined;

  const grants = [];
  grants.push(eq(knowledgeArticleAudiences.audienceType, "everyone"));
  if (viewer.volunteerRoles.length > 0) {
    grants.push(
      inArray(knowledgeArticleAudiences.volunteerRole, viewer.volunteerRoles)
    );
  }
  if (viewer.committeeIds.length > 0) {
    grants.push(
      inArray(knowledgeArticleAudiences.committeeId, viewer.committeeIds)
    );
  }

  return and(
    // Drafts and archived articles are working state. Only the board, who can
    // see everything anyway, has any business reading them.
    eq(knowledgeArticles.status, "published"),
    // An uncorrelated IN rather than a correlated EXISTS: the relational query
    // builder aliases the base table, so a subquery referencing
    // `knowledgeArticles.id` from the inside would bind to the wrong relation.
    // This form is self-contained and composes into either query API.
    inArray(
      knowledgeArticles.id,
      db
        .select({ articleId: knowledgeArticleAudiences.articleId })
        .from(knowledgeArticleAudiences)
        .where(or(...grants))
    )
  );
}

/** Convenience wrapper for a single-article check. */
export async function canViewArticle(
  viewer: ViewerAudience,
  article: { id: string; status: string },
  audiences: Array<{
    audienceType: string;
    volunteerRole: string | null;
    committeeId: string | null;
  }>
): Promise<boolean> {
  if (viewer.isBoardOrAdmin) return true;
  if (article.status !== "published") return false;
  return audiences.some(
    (a) =>
      a.audienceType === "everyone" ||
      (a.audienceType === "volunteer_role" &&
        a.volunteerRole !== null &&
        viewer.volunteerRoles.includes(a.volunteerRole as VolunteerRole)) ||
      (a.audienceType === "committee" &&
        a.committeeId !== null &&
        viewer.committeeIds.includes(a.committeeId))
  );
}

/**
 * Normalize picker input into insertable rows, dropping duplicates.
 *
 * Selecting "Everyone" alongside narrower grants collapses to "Everyone" —
 * they'd be redundant, and leaving both makes the article's chips read as more
 * restricted than it is.
 */
export function toAudienceRows(
  articleId: string,
  grants: AudienceGrant[],
  createdBy: string | null
) {
  const hasEveryone = grants.some((g) => g.type === "everyone");
  const effective: AudienceGrant[] = hasEveryone
    ? [{ type: "everyone" }]
    : grants;

  const seen = new Set<string>();
  const rows = [];
  for (const grant of effective) {
    const key =
      grant.type === "committee"
        ? `committee:${grant.committeeId}`
        : grant.type === "volunteer_role"
          ? `volunteer_role:${grant.volunteerRole}`
          : "everyone";
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      articleId,
      audienceType: grant.type,
      volunteerRole: grant.type === "volunteer_role" ? grant.volunteerRole : null,
      committeeId: grant.type === "committee" ? grant.committeeId : null,
      createdBy,
    });
  }
  return rows;
}
