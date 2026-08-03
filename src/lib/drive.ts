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

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

/**
 * Every listing carries these.
 *
 * Drive's default scope is My Drive: a folder that lives in a *shared drive*
 * lists **zero children with a 200**, which is indistinguishable from an empty
 * folder. A board that reorganizes its files into a shared drive would
 * otherwise watch every sync report success and index nothing.
 */
const ALL_DRIVES = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
} as const;

export interface DriveChild {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  modifiedTime?: string;
  webViewLink?: string;
}

/**
 * Thrown when a configured folder can't be read at all — wrong ID, trashed, or
 * (overwhelmingly the common case) never shared with the school's service
 * account.
 *
 * This has to be an error rather than an empty list. `files.list` on a folder
 * the caller can't see returns `{files: []}` with a 200, so "not shared with
 * us" and "you haven't put anything in it yet" arrive looking identical, and
 * the sync happily reports `synced: 0, errors: 0`.
 */
export class DriveFolderUnreachableError extends Error {
  constructor(
    readonly folderId: string,
    readonly reason: string,
    label?: string
  ) {
    super(
      `Google Drive folder ${label ? `"${label}" ` : ""}(${folderId}) can't be read: ${reason}. ` +
        `Share it with this school's Google service account as a Viewer, and check the folder ID.`
    );
    this.name = "DriveFolderUnreachableError";
  }
}

/**
 * Confirm a folder id resolves to a readable, untrashed folder.
 * Throws `DriveFolderUnreachableError` otherwise.
 */
export async function assertFolderReachable(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string,
  label?: string
): Promise<{ id: string; name: string }> {
  let data;
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, trashed, shortcutDetails(targetId, targetMimeType)",
      supportsAllDrives: true,
    });
    data = res.data;
  } catch (error) {
    throw new DriveFolderUnreachableError(
      folderId,
      error instanceof Error ? error.message : "unknown error",
      label
    );
  }

  if (data.trashed) {
    throw new DriveFolderUnreachableError(folderId, "it is in the trash", label);
  }

  const mimeType =
    data.mimeType === SHORTCUT_MIME
      ? data.shortcutDetails?.targetMimeType
      : data.mimeType;
  if (mimeType !== FOLDER_MIME) {
    throw new DriveFolderUnreachableError(
      folderId,
      `it is a ${mimeType ?? "file"}, not a folder`,
      label
    );
  }

  return { id: data.id!, name: data.name ?? "" };
}

/**
 * The direct children of a folder, following pagination.
 *
 * Shortcuts are resolved to whatever they point at, because a board member
 * dragging a doc into their minutes folder from elsewhere in Drive creates a
 * shortcut, and an unresolved shortcut is a mime type nothing downstream
 * recognizes.
 */
export async function listFolderChildren(
  drive: ReturnType<typeof getDriveClient>,
  folderId: string
): Promise<DriveChild[]> {
  const children: DriveChild[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, shortcutDetails(targetId, targetMimeType))",
      pageSize: 100,
      pageToken,
      ...ALL_DRIVES,
    });

    for (const file of res.data.files || []) {
      const isShortcut = file.mimeType === SHORTCUT_MIME;
      const target = file.shortcutDetails;
      if (isShortcut && !target?.targetId) continue;

      const id = isShortcut ? target!.targetId! : file.id!;
      const mimeType = isShortcut ? target!.targetMimeType! : file.mimeType!;

      children.push({
        id,
        name: file.name!,
        mimeType,
        isFolder: mimeType === FOLDER_MIME,
        modifiedTime: file.modifiedTime ?? undefined,
        // A shortcut's own link opens the shortcut, not the document.
        webViewLink: isShortcut ? undefined : file.webViewLink || undefined,
      });
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return children;
}

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

  for (const child of await listFolderChildren(drive, folderId)) {
    if (child.isFolder) {
      // Recursively get files from subfolders
      allFiles.push(
        ...(await listDriveFilesRecursively(drive, child.id, depth + 1, maxDepth))
      );
    } else {
      allFiles.push({
        id: child.id,
        name: child.name,
        mimeType: child.mimeType,
        modifiedTime: child.modifiedTime!,
        webViewLink: child.webViewLink,
        folderId,
      });
    }
  }

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

/**
 * Whether this school's service account can actually read a folder, and how
 * much is in it. Used both when a folder is added and by the "Check access"
 * button, so a folder that will sync nothing says so at the point someone can
 * still fix the sharing.
 */
export async function checkFolderAccess(
  schoolId: string,
  folderId: string,
  maxDepth = 5
): Promise<
  | { ok: true; name: string; fileCount: number }
  | { ok: false; error: string }
> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return {
      ok: false,
      error:
        "This school has no active Google service account configured. Add credentials above first.",
    };
  }

  const drive = getDriveClient(credentials);

  try {
    const folder = await assertFolderReachable(drive, folderId);
    const files = await listDriveFilesRecursively(drive, folderId, 0, maxDepth);
    return { ok: true, name: folder.name, fileCount: files.length };
  } catch (error) {
    if (error instanceof DriveFolderUnreachableError) {
      return {
        ok: false,
        error: `${error.message} (service account: ${credentials.email})`,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Drive error",
    };
  }
}

/**
 * Everything this school's service account has been handed.
 *
 * A service account owns no Drive of its own, so "shared with me" is the
 * complete list of what it can reach — which makes this the direct answer to
 * the question a board member can't answer from inside Drive: *did the share
 * actually land on this account?* Sharing attaches to an item, not to a Google
 * account, so a new folder created alongside ten working ones is shared with
 * nobody until someone shares it.
 *
 * Subfolders of these are readable too and are deliberately not listed — the
 * point is which shares exist, not how many folders that adds up to.
 */
export async function listServiceAccountShares(schoolId: string): Promise<{
  folders: Array<{ id: string; name: string; owner: string | null }>;
  sharedDrives: Array<{ id: string; name: string }>;
}> {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    throw new Error("Google credentials not configured for this school");
  }

  const drive = getDriveClient(credentials);

  const res = await drive.files.list({
    q: `sharedWithMe = true and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name, owners(emailAddress))",
    orderBy: "name",
    pageSize: 100,
    ...ALL_DRIVES,
  });

  // Shared drives are a separate world: membership there isn't a "share", so a
  // folder in one never appears above no matter how it was granted.
  let sharedDrives: Array<{ id: string; name: string }> = [];
  try {
    const drives = await drive.drives.list({ pageSize: 100 });
    sharedDrives = (drives.data.drives || []).map((d) => ({
      id: d.id!,
      name: d.name ?? "Untitled shared drive",
    }));
  } catch {
    // Not a member of any shared drive, or the scope doesn't cover it.
  }

  return {
    folders: (res.data.files || []).map((f) => ({
      id: f.id!,
      name: f.name ?? "Untitled",
      owner: f.owners?.[0]?.emailAddress ?? null,
    })),
    sharedDrives,
  };
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
      supportsAllDrives: true,
    });
    return {
      mimeType: res.data.mimeType!,
      name: res.data.name!,
    };
  } catch {
    return null;
  }
}

/**
 * Whether a file id is one of the files this school's configured folders
 * actually contain.
 *
 * `getFileContent` takes a file id and the school's service-account
 * credentials, and nothing more — it will happily read any file that account
 * can see, configured folder or not. That is right for the paths where a board
 * member pastes a Drive URL on purpose (see `indexDriveFile`), and wrong for
 * any path where the id arrived in a request body: there, the id should only
 * ever be one the caller was offered.
 *
 * Answered from the listing rather than by walking `parents` upward, because
 * the listing is already recursive and is the same source the caller's file
 * picker was populated from — so "was this offered to them?" and "is this
 * allowed?" cannot disagree.
 */
export async function isFileInSchoolFolders(
  schoolId: string,
  fileId: string
): Promise<boolean> {
  const files = await listAllDriveFiles(schoolId);
  return files.some((f) => f.id === fileId);
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
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "text" }
  );
  return res.data as string;
}
