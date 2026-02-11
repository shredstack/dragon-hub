import { getDriveClient, getSchoolGoogleCredentials } from "@/lib/google";
import { db } from "@/lib/db";
import { schools, schoolDriveIntegrations, ptaMinutes, tags } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getFileContent } from "@/lib/drive";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import { generateMinutesAnalysis } from "@/lib/ai/minutes-analysis";

const MAX_CONTENT_LENGTH = 50000; // 50KB per minutes file

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
 */
function isAgendaFile(fileName: string): boolean {
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
  let pageToken: string | undefined;

  // Minutes document types
  const supportedMimeTypes = [
    "application/vnd.google-apps.document",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
      pageSize: 100,
      pageToken,
    });

    const files = res.data.files || [];

    for (const file of files) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        // Recursively get files from subfolders
        const subFiles = await listMinutesFiles(
          drive,
          file.id!,
          depth + 1,
          maxDepth
        );
        allFiles.push(...subFiles);
      } else if (supportedMimeTypes.includes(file.mimeType!)) {
        allFiles.push({
          fileId: file.id!,
          fileName: file.name!,
          mimeType: file.mimeType!,
          googleDriveUrl:
            file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

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
}> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return { synced: 0, skipped: 0, errors: 0 };
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
    return { synced: 0, skipped: 0, errors: 0 };
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  // Track new minutes that need AI analysis
  const needsAnalysis: Array<{
    id: string;
    textContent: string;
    fileName: string;
    dateInfo: ParsedDateInfo;
  }> = [];

  // Phase 1: Sync all files to database (fast)
  for (const folder of folders) {
    try {
      const files = await listMinutesFiles(drive, folder.folderId);

      for (const file of files) {
        try {
          // Skip agenda files - only sync actual minutes
          if (isAgendaFile(file.fileName)) {
            continue;
          }

          // Check if already synced
          const existing = await db.query.ptaMinutes.findFirst({
            where: and(
              eq(ptaMinutes.schoolId, schoolId),
              eq(ptaMinutes.googleFileId, file.fileId)
            ),
          });

          // Skip already approved minutes - don't overwrite them
          if (existing?.status === "approved") {
            skipped++;
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

          // Detect if this is an agenda or minutes based on filename
          const documentType = isAgendaFile(file.fileName) ? "agenda" : "minutes";

          const minutesData = {
            schoolId,
            googleFileId: file.fileId,
            googleDriveUrl: file.googleDriveUrl,
            fileName: file.fileName,
            documentType: documentType as "minutes" | "agenda",
            meetingDate: dateInfo.meetingDate,
            meetingMonth: dateInfo.meetingMonth,
            meetingYear: dateInfo.meetingYear,
            schoolYear: CURRENT_SCHOOL_YEAR,
            textContent,
            lastSyncedAt: new Date(),
          };

          if (existing) {
            // Update existing record
            await db
              .update(ptaMinutes)
              .set(minutesData)
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
    } catch (error) {
      console.error(
        `Failed to list minutes from folder ${folder.folderId}:`,
        error
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

  return { synced, skipped, errors };
}

/**
 * Sync minutes for all schools.
 */
export async function syncAllSchoolsMinutes(): Promise<{
  schools: number;
  synced: number;
  skipped: number;
  errors: number;
}> {
  const allSchools = await db.query.schools.findMany({
    where: eq(schools.active, true),
    columns: { id: true },
  });

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const school of allSchools) {
    try {
      const result = await syncSchoolMinutes(school.id);
      totalSynced += result.synced;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
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
  };
}
