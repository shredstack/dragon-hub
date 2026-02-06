import { getDriveClient } from "@/lib/google";
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
 * Get all configured folder IDs for a school, with env var fallback
 */
export async function getDriveFolderIds(schoolId?: string): Promise<string[]> {
  const folderIds: string[] = [];

  if (schoolId) {
    const dbIntegrations = await db.query.schoolDriveIntegrations.findMany({
      where: and(
        eq(schoolDriveIntegrations.schoolId, schoolId),
        eq(schoolDriveIntegrations.active, true)
      ),
    });
    folderIds.push(...dbIntegrations.map((i) => i.folderId));
  }

  // Fallback to env var if no database configs
  if (folderIds.length === 0 && process.env.GOOGLE_DRIVE_FOLDER_ID) {
    folderIds.push(process.env.GOOGLE_DRIVE_FOLDER_ID);
  }

  return folderIds;
}

/**
 * List files from a single folder
 */
export async function listDriveFiles(folderId?: string): Promise<DriveFile[]> {
  const drive = getDriveClient();
  const folder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folder) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured");
  }

  const res = await drive.files.list({
    q: `'${folder}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });

  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime!,
    webViewLink: f.webViewLink || undefined,
    folderId: folder,
  }));
}

/**
 * List files from all configured folders for a school
 */
export async function listAllDriveFiles(schoolId?: string): Promise<DriveFile[]> {
  const folderIds = await getDriveFolderIds(schoolId);

  if (folderIds.length === 0) {
    return [];
  }

  const allFiles: DriveFile[] = [];

  for (const folderId of folderIds) {
    try {
      const files = await listDriveFiles(folderId);
      allFiles.push(...files);
    } catch (error) {
      console.error(`Failed to list files from folder ${folderId}:`, error);
    }
  }

  // Sort by modified time descending
  return allFiles.sort(
    (a, b) =>
      new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
  );
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
  fileId: string
): Promise<{ mimeType: string; name: string } | null> {
  const drive = getDriveClient();
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
  fileId: string,
  mimeType: string
): Promise<string> {
  const drive = getDriveClient();
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
