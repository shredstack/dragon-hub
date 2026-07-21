/**
 * Presentation helpers for documents. Kept free of server imports so client
 * components can use them without pulling in the database layer.
 */

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Short, human label for a file type — shown next to the file name. */
export function fileTypeLabel(
  mimeType: string | null | undefined,
  fileName: string
): string {
  const ext = fileName.split(".").pop()?.toUpperCase() ?? "";
  const type = (mimeType || "").toLowerCase();

  if (type === "application/pdf") return "PDF";
  if (type.includes("wordprocessingml") || type === "application/msword")
    return "Word";
  if (type.includes("spreadsheetml") || type.includes("ms-excel"))
    return "Excel";
  if (type.includes("presentationml") || type.includes("ms-powerpoint"))
    return "PowerPoint";
  if (type.startsWith("image/")) return "Image";
  if (type.startsWith("text/")) return ext || "Text";
  return ext;
}

export const DOCUMENT_SOURCE_LABELS: Record<string, string> = {
  google_drive: "Synced from Drive",
  upload: "Uploaded",
  drive_link: "Shared Drive link",
};

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  pending: "Indexing…",
  ready: "Searchable",
  failed: "Indexing failed",
};
