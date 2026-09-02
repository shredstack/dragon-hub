/**
 * Catalogues the email images that were uploaded before the media library
 * started collecting them.
 *
 *     npx tsx scripts/backfill-media-library.ts            # dry run
 *     npx tsx scripts/backfill-media-library.ts --write
 *     ENV_FILE=.env.prod.local npx tsx scripts/backfill-media-library.ts --write
 *
 * Every image uploaded for a weekly email now lands in `media_library` on the
 * way in (see `recordMediaLibraryUpload`), but the ones already sitting on
 * sections, headers, submitted content items and recurring templates predate
 * that and are invisible to the library — which is exactly the banner someone
 * wants again next year.
 *
 * **Insert-only and idempotent.** It writes nothing but missing `media_library`
 * rows, matches on the blob URL, and touches no blob storage. Running it twice
 * changes nothing the second time.
 */

import { config } from "dotenv";

// dotenv does not overwrite variables already in the environment, so an inline
// `DATABASE_URL=… ` prefix still wins over whichever file is loaded.
config({ path: process.env.ENV_FILE || ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNotNull } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const {
  emailCampaigns,
  emailContentImages,
  emailContentItems,
  emailRecurringSections,
  emailSections,
  mediaLibrary,
  schools,
} = schema;

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

const write = process.argv.includes("--write");

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

/**
 * A readable name for a blob nobody stored a filename for. Vercel Blob appends
 * `-<random>` before the extension, and the path is percent-encoded.
 */
function fileNameFromBlobUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").pop() || "image";
    const decoded = decodeURIComponent(last);
    // "1770783753836-fall-festival-aB12cD.png" → "fall-festival.png"
    const match = decoded.match(/^(?:\d{10,}-)?(.*?)(?:-[A-Za-z0-9]{16,})?(\.[A-Za-z0-9]+)?$/);
    if (!match) return decoded;
    return `${match[1] || "image"}${match[2] || ""}`;
  } catch {
    return "image";
  }
}

function mimeFromUrl(url: string): string | undefined {
  const ext = fileNameFromBlobUrl(url).split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXTENSION[ext] : undefined;
}

interface Candidate {
  blobUrl: string;
  fileName: string;
  sourceId: string | null;
  uploadedBy: string | null;
  /** Lower is preferred when the same blob turns up from several surfaces. */
  rank: number;
}

async function candidatesForSchool(schoolId: string): Promise<Candidate[]> {
  const [sections, campaigns, contentImages, recurring, school] =
    await Promise.all([
      db
        .select({
          url: emailSections.imageUrl,
          alt: emailSections.imageAlt,
          id: emailSections.id,
        })
        .from(emailSections)
        .innerJoin(
          emailCampaigns,
          eq(emailSections.campaignId, emailCampaigns.id)
        )
        .where(
          and(
            eq(emailCampaigns.schoolId, schoolId),
            isNotNull(emailSections.imageUrl)
          )
        ),
      db
        .select({
          url: emailCampaigns.headerImageUrl,
          alt: emailCampaigns.headerImageAlt,
          id: emailCampaigns.id,
          createdBy: emailCampaigns.createdBy,
        })
        .from(emailCampaigns)
        .where(
          and(
            eq(emailCampaigns.schoolId, schoolId),
            isNotNull(emailCampaigns.headerImageUrl)
          )
        ),
      db
        .select({
          url: emailContentImages.blobUrl,
          fileName: emailContentImages.fileName,
          id: emailContentImages.contentItemId,
          uploadedBy: emailContentImages.uploadedBy,
        })
        .from(emailContentImages)
        .innerJoin(
          emailContentItems,
          eq(emailContentImages.contentItemId, emailContentItems.id)
        )
        .where(eq(emailContentItems.schoolId, schoolId)),
      db
        .select({
          url: emailRecurringSections.imageUrl,
          id: emailRecurringSections.id,
          updatedBy: emailRecurringSections.updatedBy,
        })
        .from(emailRecurringSections)
        .where(
          and(
            eq(emailRecurringSections.schoolId, schoolId),
            isNotNull(emailRecurringSections.imageUrl)
          )
        ),
      db.query.schools.findFirst({
        where: eq(schools.id, schoolId),
        columns: { emailSettings: true },
      }),
    ]);

  const out: Candidate[] = [];

  // A real filename beats an alt text beats a name picked out of the URL, so
  // the surfaces that stored one come first.
  for (const row of contentImages) {
    if (!row.url) continue;
    out.push({
      blobUrl: row.url,
      fileName: row.fileName || fileNameFromBlobUrl(row.url),
      sourceId: row.id,
      uploadedBy: row.uploadedBy,
      rank: 0,
    });
  }
  for (const row of sections) {
    if (!row.url) continue;
    out.push({
      blobUrl: row.url,
      fileName: row.alt || fileNameFromBlobUrl(row.url),
      sourceId: row.id,
      uploadedBy: null,
      rank: 1,
    });
  }
  for (const row of campaigns) {
    if (!row.url) continue;
    out.push({
      blobUrl: row.url,
      fileName: row.alt || fileNameFromBlobUrl(row.url),
      sourceId: row.id,
      uploadedBy: row.createdBy,
      rank: 2,
    });
  }
  for (const row of recurring) {
    if (!row.url) continue;
    out.push({
      blobUrl: row.url,
      fileName: fileNameFromBlobUrl(row.url),
      sourceId: row.id,
      uploadedBy: row.updatedBy,
      rank: 3,
    });
  }
  const defaultHeader = school?.emailSettings?.headerImageUrl;
  if (defaultHeader) {
    out.push({
      blobUrl: defaultHeader,
      fileName:
        school?.emailSettings?.headerImageAlt ||
        fileNameFromBlobUrl(defaultHeader),
      sourceId: null,
      uploadedBy: null,
      rank: 4,
    });
  }

  // One row per blob, keeping the best-named candidate.
  const byUrl = new Map<string, Candidate>();
  for (const candidate of out.sort((a, b) => a.rank - b.rank)) {
    if (!byUrl.has(candidate.blobUrl)) byUrl.set(candidate.blobUrl, candidate);
  }
  return Array.from(byUrl.values());
}

async function main() {
  const allSchools = await db.query.schools.findMany({
    columns: { id: true, name: true },
  });

  let totalAdded = 0;

  for (const school of allSchools) {
    const candidates = await candidatesForSchool(school.id);
    if (candidates.length === 0) continue;

    const existing = await db.query.mediaLibrary.findMany({
      where: eq(mediaLibrary.schoolId, school.id),
      columns: { blobUrl: true },
    });
    const known = new Set(existing.map((row) => row.blobUrl));
    const missing = candidates.filter((c) => !known.has(c.blobUrl));

    console.log(
      `${school.name}: ${candidates.length} email image(s), ${missing.length} not yet in the library`
    );

    for (const candidate of missing) {
      console.log(`  + ${candidate.fileName}`);
      if (!write) continue;
      await db.insert(mediaLibrary).values({
        schoolId: school.id,
        blobUrl: candidate.blobUrl,
        fileName: candidate.fileName,
        mimeType: mimeFromUrl(candidate.blobUrl),
        altText: candidate.fileName,
        tags: [],
        reusable: true,
        sourceType: "email",
        sourceId: candidate.sourceId ?? undefined,
        uploadedBy: candidate.uploadedBy ?? undefined,
      });
    }

    totalAdded += missing.length;
  }

  console.log(
    write
      ? `\nAdded ${totalAdded} image(s) to the media library.`
      : `\nDry run — ${totalAdded} image(s) would be added. Re-run with --write.`
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
