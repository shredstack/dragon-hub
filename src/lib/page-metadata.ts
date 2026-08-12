import { cache } from "react";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  classrooms,
  committees,
  eventPlans,
  fundraisers,
  knowledgeArticles,
  ptaMinutes,
  scavengerHunts,
  schools,
  volunteerCampaigns,
} from "@/lib/db/schema";
import { getAppBaseUrl } from "@/lib/magic-link";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { resolveSignupPageContent } from "@/lib/signup-page-content.server";
import { formatLongDateOnly } from "@/lib/date-only";

/**
 * Per-page titles and link previews.
 *
 * Every DragonHub link a board member shares — a volunteer QR code, a hunt, a
 * committee join page — used to unfurl as the bare word "DragonHub", which
 * tells the parent receiving it nothing about what they were sent. These
 * helpers give each shareable page its own title and Open Graph card.
 *
 * Two rules govern what goes in one:
 *
 * - **Only public pages get a rich preview.** Everything under `(app)` is
 *   behind the middleware's login redirect, so a crawler fetching the URL is
 *   served the sign-in page and unfurls generically no matter what we emit.
 *   That is the correct outcome — an event plan's title should not be readable
 *   from a link preview by whoever the URL was forwarded to. Those pages get
 *   `privateMetadata()`, which sets the browser tab title and nothing else.
 * - **A preview says no more than the page does.** These cards are rendered by
 *   Slack, iMessage and Facebook, which fetch them unauthenticated, so they
 *   carry only what the page already shows a stranger holding the same link:
 *   the school name and the board's own editorial copy.
 *
 * The lookups are `cache()`d, so `generateMetadata` and the page body sharing
 * one code do a single query per request rather than two.
 */

export const SITE_NAME = "DragonHub";

/** The share card image. Square, so it thumbnails rather than filling a banner. */
const OG_IMAGE = "/icons/icon-512.png";

/**
 * Resolves relative OG image/URL values against the real origin. Same
 * precedence as every other externally-shared URL — see `getAppBaseUrl`.
 */
export function siteMetadataBase(): URL | undefined {
  const base = getAppBaseUrl();
  if (!base) return undefined;
  try {
    return new URL(base);
  } catch {
    return undefined;
  }
}

/** Strips tags and collapses whitespace so board-written HTML can be a description. */
function plainText(html: string | null | undefined, maxLength = 180): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/**
 * Metadata for a page whose whole audience is people holding the link and
 * nothing else — the public sign-up, hunt and committee pages.
 *
 * `title` feeds the root layout's `%s · DragonHub` template, but the Open Graph
 * title does not (templates apply only to `metadata.title`), so it is written
 * out in full here.
 */
export function shareMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description?: string;
  path?: string;
}): Metadata {
  const fullTitle = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type: "website",
      images: [OG_IMAGE],
      ...(path ? { url: path } : {}),
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}

/**
 * Metadata for a page behind the login wall: a tab title, and deliberately no
 * description or share card. See the module comment.
 */
export function privateMetadata(title: string): Metadata {
  return { title };
}

/** Falls back to the site name when a code resolves to nothing. */
export const NOT_FOUND_METADATA: Metadata = { title: SITE_NAME };

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------

/**
 * Note the deliberate absence of a status/window check in these lookups. The
 * page itself still 404s a closed hunt or a draft committee; titling the
 * preview anyway is the friendlier failure, and the code is unguessable, so
 * holding one is already the whole authorization story the page uses.
 */

export const getVolunteerSignupMeta = cache(async (code: string) => {
  const school = await db.query.schools.findFirst({
    where: eq(schools.volunteerQrCode, code),
    columns: { name: true, volunteerSettings: true },
  });
  if (!school) return null;

  const content = resolveSignupPageContent(
    school.volunteerSettings?.signupPage,
    school.name
  );
  // The default headline is the literal word "DragonHub" and the tagline
  // carries the school — which is exactly backwards for a link preview, so
  // prefer whichever of the two actually names something.
  const headline = content.headline.trim();
  const title =
    headline && headline !== SITE_NAME
      ? headline
      : content.tagline.trim() || `${school.name} Volunteer Sign-up`;

  return {
    title,
    description:
      plainText(content.introHtml) ??
      `Sign up to volunteer in your child's classroom at ${school.name}.`,
  };
});

export const getHuntMeta = cache(async (code: string) => {
  const hunt = await db.query.scavengerHunts.findFirst({
    where: eq(scavengerHunts.qrCode, code),
    columns: { title: true, intro: true },
    with: { school: { columns: { name: true } } },
  });
  if (!hunt) return null;

  return {
    title: hunt.title,
    description:
      plainText(hunt.intro) ??
      `A scavenger hunt at ${hunt.school.name} — scan, explore, and check off every stop.`,
  };
});

export const getCommitteeJoinMeta = cache(async (code: string) => {
  const committee = await db.query.committees.findFirst({
    where: eq(committees.joinCode, code),
    columns: { name: true, description: true, responsibilities: true },
    with: { school: { columns: { name: true } } },
  });
  if (!committee) return null;

  return {
    title: `Join ${committee.name}`,
    description:
      plainText(committee.description) ??
      plainText(committee.responsibilities) ??
      `Sign up to help with ${committee.name} at ${committee.school.name}.`,
  };
});

export const getCampaignMeta = cache(async (code: string) => {
  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: eq(volunteerCampaigns.qrCode, code),
    columns: { title: true, intro: true },
    with: { school: { columns: { name: true } } },
  });
  if (!campaign) return null;

  return {
    title: campaign.title,
    description:
      plainText(campaign.intro) ??
      `Tell ${campaign.school.name} which events you might be interested in helping with this year.`,
  };
});

// ---------------------------------------------------------------------------
// Pages behind the login wall — tab titles only
// ---------------------------------------------------------------------------

/**
 * Scoped to the viewer's current school so a tab title can't be used to probe
 * for row titles at another school. This is a *display* check, not the
 * authorization one — the page still runs its own assert and 404s.
 */
async function scopedTitle<T>(
  load: (schoolId: string) => Promise<T | null | undefined>
): Promise<T | null> {
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;
  return (await load(schoolId)) ?? null;
}

export const getEventPlanTitle = cache(async (id: string) =>
  scopedTitle(async (schoolId) => {
    const row = await db.query.eventPlans.findFirst({
      where: and(eq(eventPlans.id, id), eq(eventPlans.schoolId, schoolId)),
      columns: { title: true },
    });
    return row?.title;
  })
);

export const getCommitteeTitle = cache(async (id: string) =>
  scopedTitle(async (schoolId) => {
    const row = await db.query.committees.findFirst({
      where: and(eq(committees.id, id), eq(committees.schoolId, schoolId)),
      columns: { name: true },
    });
    return row?.name;
  })
);

export const getClassroomTitle = cache(async (id: string) =>
  scopedTitle(async (schoolId) => {
    const row = await db.query.classrooms.findFirst({
      where: and(eq(classrooms.id, id), eq(classrooms.schoolId, schoolId)),
      columns: { name: true },
    });
    return row?.name;
  })
);

export const getFundraiserTitle = cache(async (id: string) =>
  scopedTitle(async (schoolId) => {
    const row = await db.query.fundraisers.findFirst({
      where: and(eq(fundraisers.id, id), eq(fundraisers.schoolId, schoolId)),
      columns: { name: true },
    });
    return row?.name;
  })
);

export const getKnowledgeArticleTitle = cache(async (slug: string) =>
  scopedTitle(async (schoolId) => {
    const row = await db.query.knowledgeArticles.findFirst({
      where: and(
        eq(knowledgeArticles.slug, slug),
        eq(knowledgeArticles.schoolId, schoolId)
      ),
      columns: { title: true },
    });
    return row?.title;
  })
);

export const getMinutesTitle = cache(async (id: string) =>
  scopedTitle(async (schoolId) => {
    const row = await db.query.ptaMinutes.findFirst({
      where: and(eq(ptaMinutes.id, id), eq(ptaMinutes.schoolId, schoolId)),
      columns: { fileName: true, meetingDate: true, documentType: true },
    });
    if (!row) return null;
    const label = row.documentType === "agenda" ? "Agenda" : "Minutes";
    return row.meetingDate
      ? `${label} — ${formatLongDateOnly(row.meetingDate)}`
      : row.fileName;
  })
);
