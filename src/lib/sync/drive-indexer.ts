import { getDriveClient, getSchoolGoogleCredentials } from "@/lib/google";
import { db } from "@/lib/db";
import {
  schools,
  schoolDriveIntegrations,
  driveFileIndex,
} from "@/lib/db/schema";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { getFileContent } from "@/lib/drive";

const MAX_CONTENT_LENGTH = 10000; // 10KB per file

interface IndexedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  parentFolderId: string;
  textContent: string | null;
  integrationId: string;
  integrationName: string;
}

/**
 * Recursively list all files in a folder and its subfolders.
 */
async function listFilesRecursively(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string,
  integrationId: string,
  integrationName: string,
  depth = 0,
  maxDepth = 5
): Promise<
  Array<{
    id: string;
    name: string;
    mimeType: string;
    parentFolderId: string;
    integrationId: string;
    integrationName: string;
  }>
> {
  if (depth > maxDepth) return [];

  const allFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    parentFolderId: string;
    integrationId: string;
    integrationName: string;
  }> = [];

  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType)",
      pageSize: 100,
      pageToken,
    });

    const files = res.data.files || [];

    for (const file of files) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        // Recursively get files from subfolders
        const subFiles = await listFilesRecursively(
          drive,
          file.id!,
          integrationId,
          integrationName,
          depth + 1,
          maxDepth
        );
        allFiles.push(...subFiles);
      } else {
        allFiles.push({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          parentFolderId: folderId,
          integrationId,
          integrationName,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return allFiles;
}

/**
 * Index all Drive files for a single school.
 * Fetches all files from configured folders, extracts text, and upserts to DB.
 */
export async function indexSchoolDriveFiles(schoolId: string): Promise<{
  indexed: number;
  errors: number;
  deleted: number;
}> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return { indexed: 0, errors: 0, deleted: 0 };
  }

  const drive = getDriveClient(credentials);

  // Get all active folder integrations
  const folders = await db.query.schoolDriveIntegrations.findMany({
    where: and(
      eq(schoolDriveIntegrations.schoolId, schoolId),
      eq(schoolDriveIntegrations.active, true)
    ),
  });

  if (folders.length === 0) {
    return { indexed: 0, errors: 0, deleted: 0 };
  }

  const indexedFiles: IndexedFile[] = [];
  let errors = 0;

  // Collect all files from all folders
  for (const folder of folders) {
    try {
      const folderMaxDepth = folder.maxDepth ?? 5;
      const integrationName = folder.name || "";
      const files = await listFilesRecursively(
        drive,
        folder.folderId,
        folder.id,
        integrationName,
        0,
        folderMaxDepth
      );

      for (const file of files) {
        try {
          // Try to extract text content
          let textContent: string | null = null;

          // Only extract text from supported file types
          const supportedTypes = [
            "application/vnd.google-apps.document",
            "application/vnd.google-apps.spreadsheet",
            "application/vnd.google-apps.presentation",
            "text/plain",
            "text/markdown",
            "text/csv",
          ];

          if (
            supportedTypes.includes(file.mimeType) ||
            file.mimeType.startsWith("text/")
          ) {
            try {
              const content = await getFileContent(
                schoolId,
                file.id,
                file.mimeType
              );
              textContent =
                content.length > MAX_CONTENT_LENGTH
                  ? content.slice(0, MAX_CONTENT_LENGTH)
                  : content;
            } catch {
              // Failed to extract content, continue without it
            }
          }

          indexedFiles.push({
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            parentFolderId: file.parentFolderId,
            textContent,
            integrationId: file.integrationId,
            integrationName: file.integrationName,
          });
        } catch {
          errors++;
        }
      }
    } catch (error) {
      console.error(`Failed to list files from folder ${folder.folderId}:`, error);
      errors++;
    }
  }

  // Upsert all indexed files using raw SQL for proper tsvector handling
  for (const file of indexedFiles) {
    try {
      await db.execute(sql`
        INSERT INTO drive_file_index (
          school_id,
          file_id,
          file_name,
          mime_type,
          parent_folder_id,
          text_content,
          integration_id,
          integration_name,
          search_vector,
          last_indexed_at
        ) VALUES (
          ${schoolId},
          ${file.fileId},
          ${file.fileName},
          ${file.mimeType},
          ${file.parentFolderId},
          ${file.textContent},
          ${file.integrationId},
          ${file.integrationName},
          setweight(to_tsvector('english', ${file.fileName}), 'A') ||
            setweight(to_tsvector('english', coalesce(${file.integrationName}, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(${file.textContent}, '')), 'C'),
          NOW()
        )
        ON CONFLICT (school_id, file_id) DO UPDATE SET
          file_name = EXCLUDED.file_name,
          mime_type = EXCLUDED.mime_type,
          parent_folder_id = EXCLUDED.parent_folder_id,
          text_content = EXCLUDED.text_content,
          integration_id = EXCLUDED.integration_id,
          integration_name = EXCLUDED.integration_name,
          search_vector = EXCLUDED.search_vector,
          last_indexed_at = NOW()
      `);
    } catch (error) {
      console.error(`Failed to index file ${file.fileName}:`, error);
      errors++;
    }
  }

  // Delete files that no longer exist in Drive
  let deleted = 0;
  if (indexedFiles.length > 0) {
    const existingFileIds = indexedFiles.map((f) => f.fileId);
    const deletedResult = await db
      .delete(driveFileIndex)
      .where(
        and(
          eq(driveFileIndex.schoolId, schoolId),
          notInArray(driveFileIndex.fileId, existingFileIds)
        )
      )
      .returning();
    deleted = deletedResult.length;
  }

  return {
    indexed: indexedFiles.length,
    errors,
    deleted,
  };
}

/**
 * Index Drive files for all schools.
 */
export async function indexAllSchoolsDriveFiles(): Promise<{
  schools: number;
  totalIndexed: number;
  totalErrors: number;
  totalDeleted: number;
}> {
  const allSchools = await db.query.schools.findMany({
    where: eq(schools.active, true),
    columns: { id: true },
  });

  let totalIndexed = 0;
  let totalErrors = 0;
  let totalDeleted = 0;

  for (const school of allSchools) {
    try {
      const result = await indexSchoolDriveFiles(school.id);
      totalIndexed += result.indexed;
      totalErrors += result.errors;
      totalDeleted += result.deleted;
    } catch (error) {
      console.error(`Failed to index school ${school.id}:`, error);
      totalErrors++;
    }
  }

  return {
    schools: allSchools.length,
    totalIndexed,
    totalErrors,
    totalDeleted,
  };
}
