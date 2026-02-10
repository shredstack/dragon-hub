import { getDriveClient, getSchoolGoogleCredentials } from "@/lib/google";
import { db } from "@/lib/db";
import { schoolDriveIntegrations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  folderId?: string;
}

const GOOGLE_EXPORT_MIMES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

/**
 * Get all configured folder IDs for a school.
 * Returns empty array if school has no drive integrations configured.
 */
export async function getDriveFolderIds(schoolId: string): Promise<string[]> {
  const dbIntegrations = await db.query.schoolDriveIntegrations.findMany({
    where: and(
      eq(schoolDriveIntegrations.schoolId, schoolId),
      eq(schoolDriveIntegrations.active, true)
    ),
  });
  return dbIntegrations.map((i) => i.folderId);
}

/**
 * Recursively list all files in a folder and its subfolders.
 */
async function listDriveFilesRecursively(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string,
  depth = 0,
  maxDepth = 5
): Promise<DriveFile[]> {
  if (depth > maxDepth) return [];

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
      pageSize: 100,
      pageToken,
    });

    const files = res.data.files || [];

    for (const file of files) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        // Recursively get files from subfolders
        const subFiles = await listDriveFilesRecursively(
          drive,
          file.id!,
          depth + 1,
          maxDepth
        );
        allFiles.push(...subFiles);
      } else {
        allFiles.push({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          modifiedTime: file.modifiedTime!,
          webViewLink: file.webViewLink || undefined,
          folderId,
        });
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return allFiles;
}

/**
 * List files from a single folder using school credentials.
 * Requires schoolId to fetch the appropriate Google credentials.
 */
export async function listDriveFiles(
  schoolId: string,
  folderId: string,
  maxDepth = 5
): Promise<DriveFile[]> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    throw new Error("Google credentials not configured for this school");
  }

  const drive = getDriveClient(credentials);
  return listDriveFilesRecursively(drive, folderId, 0, maxDepth);
}

/**
 * List files from all configured folders for a school.
 * Returns empty array if school has no Google credentials or drive integrations.
 */
export async function listAllDriveFiles(schoolId: string): Promise<DriveFile[]> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return [];
  }

  const folders = await db.query.schoolDriveIntegrations.findMany({
    where: and(
      eq(schoolDriveIntegrations.schoolId, schoolId),
      eq(schoolDriveIntegrations.active, true)
    ),
  });
  if (folders.length === 0) {
    return [];
  }

  const allFiles: DriveFile[] = [];

  for (const folder of folders) {
    try {
      const files = await listDriveFiles(schoolId, folder.folderId, folder.maxDepth ?? 5);
      allFiles.push(...files);
    } catch (error) {
      console.error(`Failed to list files from folder ${folder.folderId}:`, error);
    }
  }

  // Sort by modified time descending
  return allFiles.sort(
    (a, b) =>
      new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
  );
}

/**
 * Extract a Google Drive folder ID from various URL formats:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/folders/FOLDER_ID?usp=drive_link
 * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
 * Returns the input unchanged if it's already just an ID.
 */
export function parseDriveFolderId(input: string): string {
  const trimmed = input.trim();

  // If it doesn't look like a URL, assume it's already a folder ID
  if (!trimmed.includes("/") && !trimmed.includes("?")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.endsWith("google.com")) {
      return trimmed;
    }

    // Format: /drive/folders/FOLDER_ID or /drive/u/0/folders/FOLDER_ID
    const folderMatch = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];

    // Format: ?id=FOLDER_ID
    const idParam = parsed.searchParams.get("id");
    if (idParam) return idParam;

    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Extract a Google Drive file ID from various URL formats:
 * - https://docs.google.com/document/d/FILE_ID/...
 * - https://drive.google.com/file/d/FILE_ID/...
 * - https://drive.google.com/open?id=FILE_ID
 * - https://docs.google.com/spreadsheets/d/FILE_ID/...
 * - https://docs.google.com/presentation/d/FILE_ID/...
 */
export function parseDriveFileId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      !parsed.hostname.endsWith("google.com") &&
      !parsed.hostname.endsWith("googleapis.com")
    ) {
      return null;
    }

    // Format: /d/FILE_ID or /d/FILE_ID/
    const dMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch) return dMatch[1];

    // Format: ?id=FILE_ID
    const idParam = parsed.searchParams.get("id");
    if (idParam) return idParam;

    return null;
  } catch {
    return null;
  }
}

export async function getFileMeta(
  schoolId: string,
  fileId: string
): Promise<{ mimeType: string; name: string } | null> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return null;
  }

  const drive = getDriveClient(credentials);
  try {
    const res = await drive.files.get({
      fileId,
      fields: "mimeType, name",
    });
    return {
      mimeType: res.data.mimeType!,
      name: res.data.name!,
    };
  } catch {
    return null;
  }
}

export async function getFileContent(
  schoolId: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    throw new Error("Google credentials not configured for this school");
  }

  const drive = getDriveClient(credentials);
  const exportMime = GOOGLE_EXPORT_MIMES[mimeType];

  if (exportMime) {
    // Google Workspace files: export as text
    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: "text" }
    );
    return res.data as string;
  }

  // Other Google Apps types we don't have a specific export for — try text/plain
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" }
    );
    return res.data as string;
  }

  // Regular files: download directly
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "text" }
  );
  return res.data as string;
}
