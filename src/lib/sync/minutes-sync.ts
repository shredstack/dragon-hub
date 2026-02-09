import { getDriveClient, getSchoolGoogleCredentials } from "@/lib/google";
import { db } from "@/lib/db";
import { schools, schoolDriveIntegrations, ptaMinutes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getFileContent } from "@/lib/drive";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

const MAX_CONTENT_LENGTH = 50000; // 50KB per minutes file

interface MinutesFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  googleDriveUrl: string;
}

/**
 * Parse meeting date from filename or content.
 * Attempts common date patterns in PTA minutes filenames.
 */
function parseMeetingDate(
  fileName: string,
  content: string | null
): string | null {
  // Pattern 1: YYYY-MM-DD
  const isoMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // Pattern 2: MM-DD-YYYY or MM/DD/YYYY
  const usMatch = fileName.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Pattern 3: Month name + year (e.g., "January 2025 Minutes")
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
  const monthMatch = fileName
    .toLowerCase()
    .match(new RegExp(`(${monthNames.join("|")})\\s*(\\d{4})`));
  if (monthMatch) {
    const monthIndex = monthNames.indexOf(monthMatch[1]) + 1;
    return `${monthMatch[2]}-${String(monthIndex).padStart(2, "0")}-15`;
  }

  // Pattern 4: Try to find date in first 500 chars of content
  if (content) {
    const contentStart = content.slice(0, 500);
    const contentIsoMatch = contentStart.match(/(\d{4}-\d{2}-\d{2})/);
    if (contentIsoMatch) return contentIsoMatch[1];

    const contentUsMatch = contentStart.match(
      /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/
    );
    if (contentUsMatch) {
      const [, month, day, year] = contentUsMatch;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  return null;
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
  errors: number;
}> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return { synced: 0, errors: 0 };
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
    return { synced: 0, errors: 0 };
  }

  let synced = 0;
  let errors = 0;

  // Collect all files from all minutes folders
  for (const folder of folders) {
    try {
      const files = await listMinutesFiles(drive, folder.folderId);

      for (const file of files) {
        try {
          // Check if already synced
          const existing = await db.query.ptaMinutes.findFirst({
            where: and(
              eq(ptaMinutes.schoolId, schoolId),
              eq(ptaMinutes.googleFileId, file.fileId)
            ),
          });

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

          // Parse meeting date from filename or content
          const meetingDate = parseMeetingDate(file.fileName, textContent);

          const minutesData = {
            schoolId,
            googleFileId: file.fileId,
            googleDriveUrl: file.googleDriveUrl,
            fileName: file.fileName,
            meetingDate,
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
            await db.insert(ptaMinutes).values(minutesData);
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

  return { synced, errors };
}

/**
 * Sync minutes for all schools.
 */
export async function syncAllSchoolsMinutes(): Promise<{
  schools: number;
  synced: number;
  errors: number;
}> {
  const allSchools = await db.query.schools.findMany({
    where: eq(schools.active, true),
    columns: { id: true },
  });

  let totalSynced = 0;
  let totalErrors = 0;

  for (const school of allSchools) {
    try {
      const result = await syncSchoolMinutes(school.id);
      totalSynced += result.synced;
      totalErrors += result.errors;
    } catch (error) {
      console.error(`Failed to sync minutes for school ${school.id}:`, error);
      totalErrors++;
    }
  }

  return {
    schools: allSchools.length,
    synced: totalSynced,
    errors: totalErrors,
  };
}
