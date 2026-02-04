import { getDriveClient } from "@/lib/google";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

const GOOGLE_EXPORT_MIMES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

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
  }));
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
