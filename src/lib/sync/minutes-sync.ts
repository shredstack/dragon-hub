import { getDriveClient, getSchoolGoogleCredentials } from "@/lib/google";
import { db } from "@/lib/db";
import { schools, schoolDriveIntegrations, ptaMinutes, tags } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  DriveFolderUnreachableError,
  assertFolderReachable,
  getFileContent,
  listFolderChildren,
} from "@/lib/drive";
import { getSchoolCurrentYear, getSchoolYearForMonth } from "@/lib/school-year";
import { generateMinutesAnalysis } from "@/lib/ai/minutes-analysis";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { formatMinutesForEmbedding } from "@/lib/ai/embedding-formatters";
import { touchSyncStatus } from "@/lib/sync-status";

// One OpenAI request per chunk of files — mirrors EMBEDDING_BATCH_SIZE in
// drive-indexer.ts.
const EMBEDDING_BATCH_SIZE = 20;

const MAX_CONTENT_LENGTH = 50000; // 50KB per minutes file

// Document types a set of minutes can plausibly be. Anything else in the
// folder (images, the sign-in sheet spreadsheet) is not a minutes document.
const SUPPORTED_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface MinutesFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  googleDriveUrl: string;
}

interface ParsedDateInfo {
  meetingDate: string | null;
  meetingMonth: number | null;
  meetingYear: number | null;
}

/**
 * Detect if a file is an agenda based on its filename.
 *
 * Exported for drive-indexer.ts: a "minutes"-type folder's actual minutes
 * documents belong solely to this sync (see syncSchoolMinutes and
 * embedPendingMinutes below), but agendas have no equivalent sync of their
 * own, so the generic Drive indexer still needs to know which files in that
 * same folder are its responsibility.
 */
export function isAgendaFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return lowerName.includes("agenda");
}

/**
 * Parse meeting date, month, and year from filename or content.
 * Attempts common date patterns in PTA minutes/agenda filenames.
 * Returns separate month and year for easy filtering.
 */
function parseMeetingDateInfo(
  fileName: string,
  content: string | null
): ParsedDateInfo {
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  // Pattern 1: YYYY-MM-DD
  const isoMatch = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return {
      meetingDate: `${year}-${month}-${day}`,
      meetingMonth: parseInt(month, 10),
      meetingYear: parseInt(year, 10),
    };
  }

  // Pattern 2: MM-DD-YYYY or MM/DD/YYYY
  const usMatch = fileName.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return {
      meetingDate: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      meetingMonth: parseInt(month, 10),
      meetingYear: parseInt(year, 10),
    };
  }

  // Pattern 3: Month name + year (e.g., "January 2025 Minutes", "February 2025 Agenda")
  const monthMatch = fileName
    .toLowerCase()
    .match(new RegExp(`(${monthNames.join("|")})\\s*(\\d{4})`));
  if (monthMatch) {
    const monthIndex = monthNames.indexOf(monthMatch[1]) + 1;
    const year = parseInt(monthMatch[2], 10);
    return {
      meetingDate: `${year}-${String(monthIndex).padStart(2, "0")}-15`,
      meetingMonth: monthIndex,
      meetingYear: year,
    };
  }

  // Pattern 4: Try to find date in first 500 chars of content
  if (content) {
    const contentStart = content.slice(0, 500);

    const contentIsoMatch = contentStart.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (contentIsoMatch) {
      const [, year, month, day] = contentIsoMatch;
      return {
        meetingDate: `${year}-${month}-${day}`,
        meetingMonth: parseInt(month, 10),
        meetingYear: parseInt(year, 10),
      };
    }

    const contentUsMatch = contentStart.match(
      /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/
    );
    if (contentUsMatch) {
      const [, month, day, year] = contentUsMatch;
      return {
        meetingDate: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
        meetingMonth: parseInt(month, 10),
        meetingYear: parseInt(year, 10),
      };
    }

    // Try month name pattern in content too
    const contentMonthMatch = contentStart
      .toLowerCase()
      .match(new RegExp(`(${monthNames.join("|")})\\s*(\\d{4})`));
    if (contentMonthMatch) {
      const monthIndex = monthNames.indexOf(contentMonthMatch[1]) + 1;
      const year = parseInt(contentMonthMatch[2], 10);
      return {
        meetingDate: `${year}-${String(monthIndex).padStart(2, "0")}-15`,
        meetingMonth: monthIndex,
        meetingYear: year,
      };
    }
  }

  return {
    meetingDate: null,
    meetingMonth: null,
    meetingYear: null,
  };
}

/**
 * Recursively list all document files in a folder and its subfolders.
 * Only includes documents that could be minutes (Google Docs, PDFs, text).
 */
async function listMinutesFiles(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string,
  depth = 0,
  maxDepth = 5
): Promise<MinutesFile[]> {
  if (depth > maxDepth) return [];

  const allFiles: MinutesFile[] = [];

  for (const child of await listFolderChildren(drive, folderId)) {
    if (child.isFolder) {
      // Recursively get files from subfolders
      allFiles.push(
        ...(await listMinutesFiles(drive, child.id, depth + 1, maxDepth))
      );
    } else if (SUPPORTED_MIME_TYPES.includes(child.mimeType)) {
      allFiles.push({
        fileId: child.id,
        fileName: child.name,
        mimeType: child.mimeType,
        googleDriveUrl:
          child.webViewLink ||
          `https://drive.google.com/file/d/${child.id}/view`,
      });
    }
  }

  return allFiles;
}

/**
 * Sync minutes for a single school.
 * Fetches all minutes files from configured folders, extracts text, and upserts to DB.
 */
export async function syncSchoolMinutes(schoolId: string): Promise<{
  synced: number;
  skipped: number;
  errors: number;
  /**
   * Folders that couldn't be read at all, in words a board member can act on.
   * Surfaced by the Sync Minutes button — a folder nobody shared with the
   * service account is the single most common reason minutes "don't sync",
   * and it is invisible from inside Drive.
   */
  folderProblems: string[];
}> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return {
      synced: 0,
      skipped: 0,
      errors: 0,
      folderProblems: [
        "This school has no active Google service account configured.",
      ],
    };
  }

  const drive = getDriveClient(credentials);

  // Get all active folder integrations marked as "minutes" type
  const folders = await db.query.schoolDriveIntegrations.findMany({
    where: and(
      eq(schoolDriveIntegrations.schoolId, schoolId),
      eq(schoolDriveIntegrations.active, true),
      eq(schoolDriveIntegrations.folderType, "minutes")
    ),
  });

  if (folders.length === 0) {
    return { synced: 0, skipped: 0, errors: 0, folderProblems: [] };
  }

  const schoolCurrentYear = await getSchoolCurrentYear(schoolId);

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  const folderProblems: string[] = [];

  // Track new minutes that need AI analysis
  const needsAnalysis: Array<{
    id: string;
    textContent: string;
    fileName: string;
    dateInfo: ParsedDateInfo;
  }> = [];

  // Phase 1: Sync all files to database (fast)
  for (const folder of folders) {
    const folderLabel = folder.name || folder.folderId;
    try {
      // Fails loudly on a folder that was never shared with the service
      // account, which otherwise lists as empty with a 200.
      await assertFolderReachable(drive, folder.folderId, folder.name ?? undefined);

      const files = await listMinutesFiles(
        drive,
        folder.folderId,
        0,
        folder.maxDepth ?? 5
      );

      if (files.length === 0) {
        folderProblems.push(
          `"${folderLabel}" is readable but contains no minutes documents${
            (folder.maxDepth ?? 5) === 0
              ? " (subfolder depth is set to “this folder only”)"
              : ""
          }.`
        );
      }

      let agendasSkipped = 0;

      for (const file of files) {
        try {
          // Skip agenda files - only sync actual minutes
          if (isAgendaFile(file.fileName)) {
            agendasSkipped++;
            continue;
          }

          // Check if already synced
          const existing = await db.query.ptaMinutes.findFirst({
            where: and(
              eq(ptaMinutes.schoolId, schoolId),
              eq(ptaMinutes.googleFileId, file.fileId)
            ),
          });

          // Skip already approved minutes' content and analysis — those are
          // the school's finalized record and a board member's edits must
          // stick. But schoolYear can still carry the old bug (a folder
          // override or "now" stamped at an earlier sync), and approved
          // minutes are exactly what Ask DragonHub needs it right for. Fix
          // just that column, derived from the row's own already-parsed
          // meetingMonth/meetingYear rather than re-parsing the file, so a
          // manual meeting-date correction is never touched.
          if (existing?.status === "approved") {
            skipped++;
            if (existing.meetingMonth && existing.meetingYear) {
              const correctedSchoolYear = getSchoolYearForMonth(
                existing.meetingMonth,
                existing.meetingYear
              );
              if (correctedSchoolYear !== existing.schoolYear) {
                await db
                  .update(ptaMinutes)
                  .set({
                    schoolYear: correctedSchoolYear,
                    // The embedded text bakes the school year in (see
                    // formatMinutesForEmbedding) — clear it so Phase 3 below
                    // regenerates it against the corrected value instead of
                    // leaving a vector that still describes the old one.
                    embedding: null,
                  })
                  .where(eq(ptaMinutes.id, existing.id));
              }
            }
            continue;
          }

          // Try to extract text content
          let textContent: string | null = null;
          try {
            const content = await getFileContent(
              schoolId,
              file.fileId,
              file.mimeType
            );
            textContent =
              content.length > MAX_CONTENT_LENGTH
                ? content.slice(0, MAX_CONTENT_LENGTH)
                : content;
          } catch {
            // Failed to extract content, continue without it
            console.warn(
              `Failed to extract content from ${file.fileName}, continuing without text`
            );
          }

          // Parse meeting date, month, and year from filename or content
          const dateInfo = parseMeetingDateInfo(file.fileName, textContent);

          const minutesData = {
            schoolId,
            googleFileId: file.fileId,
            googleDriveUrl: file.googleDriveUrl,
            fileName: file.fileName,
            // Agendas are filtered out above; everything that reaches here is
            // a set of minutes.
            documentType: "minutes" as const,
            meetingDate: dateInfo.meetingDate,
            meetingMonth: dateInfo.meetingMonth,
            meetingYear: dateInfo.meetingYear,
            // Derive from the meeting's own date whenever we have one — a
            // single "PTA Minutes" folder holding several years of history is
            // the common case, and stamping every file in it with one static
            // year (the folder override, or worse "now") is what let a
            // January 2025 meeting get filed under school year 2025-2026.
            // The folder's schoolYear only matters as a fallback for a file
            // whose date genuinely couldn't be parsed from its name or
            // content.
            schoolYear:
              dateInfo.meetingMonth && dateInfo.meetingYear
                ? getSchoolYearForMonth(dateInfo.meetingMonth, dateInfo.meetingYear)
                : folder.schoolYear || schoolCurrentYear,
            textContent,
            lastSyncedAt: new Date(),
          };

          if (existing) {
            // Update existing record. A schoolYear correction invalidates the
            // embedding, which bakes the year into its source text (see
            // formatMinutesForEmbedding) — clear it so Phase 3 below
            // regenerates it rather than leaving a vector that still
            // describes the old, wrong year.
            await db
              .update(ptaMinutes)
              .set(
                existing.schoolYear !== minutesData.schoolYear
                  ? { ...minutesData, embedding: null }
                  : minutesData
              )
              .where(eq(ptaMinutes.id, existing.id));
          } else {
            // Insert new record
            const [insertedMinutes] = await db
              .insert(ptaMinutes)
              .values(minutesData)
              .returning({ id: ptaMinutes.id });

            // Queue for AI analysis if has content
            if (textContent && insertedMinutes) {
              needsAnalysis.push({
                id: insertedMinutes.id,
                textContent,
                fileName: file.fileName,
                dateInfo,
              });
            }
          }

          synced++;
        } catch (error) {
          console.error(`Failed to sync minutes file ${file.fileName}:`, error);
          errors++;
        }
      }

      if (files.length > 0 && agendasSkipped === files.length) {
        folderProblems.push(
          `Every document in "${folderLabel}" (${agendasSkipped}) has "agenda" in its name, so none were synced — the Minutes tab only takes minutes.`
        );
      }
    } catch (error) {
      console.error(
        `Failed to list minutes from folder ${folder.folderId}:`,
        error
      );
      folderProblems.push(
        error instanceof DriveFolderUnreachableError
          ? `${error.message} (service account: ${credentials.email})`
          : `Couldn't read "${folderLabel}": ${
              error instanceof Error ? error.message : "unknown error"
            }`
      );
      errors++;
    }
  }

  // Phase 2: Run AI analysis in parallel batches (slow, batched)
  if (needsAnalysis.length > 0) {
    // Get existing tags once for all analysis calls
    const existingTags = await db.query.tags.findMany({
      where: eq(tags.schoolId, schoolId),
      columns: { displayName: true },
      orderBy: [desc(tags.usageCount)],
    });
    const tagNames = existingTags.map((t) => t.displayName);

    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES_MS = 2000;

    for (let i = 0; i < needsAnalysis.length; i += BATCH_SIZE) {
      const batch = needsAnalysis.slice(i, i + BATCH_SIZE);

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const analysis = await generateMinutesAnalysis(
            item.textContent,
            item.fileName,
            tagNames
          );

          // Update with analysis results
          await db
            .update(ptaMinutes)
            .set({
              aiSummary: analysis.summary,
              aiKeyItems: analysis.keyItems,
              aiActionItems: analysis.actionItems,
              aiImprovements: analysis.improvements,
              tags: analysis.suggestedTags,
              aiExtractedDate: analysis.extractedDate,
              dateConfidence: analysis.dateConfidence,
              meetingDate:
                !item.dateInfo.meetingDate && analysis.dateConfidence === "high"
                  ? analysis.extractedDate
                  : item.dateInfo.meetingDate,
            })
            .where(eq(ptaMinutes.id, item.id));

          // Ensure tags exist in the database
          for (const tagName of analysis.suggestedTags) {
            const name = tagName.toLowerCase().trim();
            if (!name) continue;

            const existingTag = await db.query.tags.findFirst({
              where: and(eq(tags.schoolId, schoolId), eq(tags.name, name)),
            });

            if (existingTag) {
              await db
                .update(tags)
                .set({
                  usageCount: existingTag.usageCount + 1,
                  updatedAt: new Date(),
                })
                .where(eq(tags.id, existingTag.id));
            } else {
              await db.insert(tags).values({
                schoolId,
                name,
                displayName: tagName.trim(),
                usageCount: 1,
              });
            }
          }

          return analysis;
        })
      );

      // Log any failures
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === "rejected") {
          console.error(
            `Failed to generate AI analysis for ${batch[j].fileName}:`,
            (results[j] as PromiseRejectedResult).reason
          );
        }
      }

      // Add delay between batches to avoid rate limiting (skip after last batch)
      if (i + BATCH_SIZE < needsAnalysis.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    }
  }

  // Phase 3: embed anything missing an embedding — the minutes just synced
  // above, plus any older row that was never embedded (this table predates
  // Ask DragonHub searching it at all).
  await embedPendingMinutes(schoolId);

  await touchSyncStatus(schoolId, "minutesLastSyncedAt", new Date());

  return { synced, skipped, errors, folderProblems };
}

/**
 * Generate embeddings for this school's minutes that are missing one.
 *
 * Ask DragonHub previously never queried `pta_minutes` — it only saw minutes
 * through a separate, generic Drive-folder sync into `drive_file_index`
 * (see semanticSearch in vector-search.ts). This is what makes the real
 * table, with its full text and meeting-date metadata, actually findable.
 */
export async function embedPendingMinutes(schoolId: string): Promise<number> {
  const pending = await db.query.ptaMinutes.findMany({
    where: and(
      eq(ptaMinutes.schoolId, schoolId),
      isNull(ptaMinutes.embedding),
      isNull(ptaMinutes.archivedAt)
    ),
    columns: {
      id: true,
      fileName: true,
      documentType: true,
      meetingDate: true,
      meetingMonth: true,
      meetingYear: true,
      schoolYear: true,
      textContent: true,
    },
  });

  let embedded = 0;

  for (let i = 0; i < pending.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = pending.slice(i, i + EMBEDDING_BATCH_SIZE);
    try {
      const vectors = await generateEmbeddings(
        batch.map((minutes) => formatMinutesForEmbedding(minutes))
      );

      for (const [index, minutes] of batch.entries()) {
        await db
          .update(ptaMinutes)
          .set({ embedding: vectors[index] })
          .where(eq(ptaMinutes.id, minutes.id));
        embedded++;
      }
    } catch (error) {
      // A failed batch stays unembedded and is retried on the next sync
      // rather than failing the whole sync run.
      console.error(`Failed to embed minutes batch for ${schoolId}:`, error);
    }
  }

  return embedded;
}

/**
 * Sync minutes for all schools.
 */
export async function syncAllSchoolsMinutes(): Promise<{
  schools: number;
  synced: number;
  skipped: number;
  errors: number;
  folderProblems: string[];
}> {
  const allSchools = await db.query.schools.findMany({
    where: eq(schools.active, true),
    columns: { id: true },
  });

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const folderProblems: string[] = [];

  for (const school of allSchools) {
    try {
      const result = await syncSchoolMinutes(school.id);
      totalSynced += result.synced;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      for (const problem of result.folderProblems) {
        // The cron log is where an unreachable folder gets noticed between
        // manual syncs, so name the school it belongs to.
        console.warn(`[minutes-sync] school ${school.id}: ${problem}`);
        folderProblems.push(problem);
      }
    } catch (error) {
      console.error(`Failed to sync minutes for school ${school.id}:`, error);
      totalErrors++;
    }
  }

  return {
    schools: allSchools.length,
    synced: totalSynced,
    skipped: totalSkipped,
    errors: totalErrors,
    folderProblems,
  };
}
