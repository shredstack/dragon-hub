/**
 * Which documents can be read inside the app, and how.
 *
 * Kept free of server imports so the attachment lists can decide whether to
 * offer a "View" button without a round trip.
 */

export type PreviewKind = "image" | "pdf" | "extracted";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

/** Types whose text we extract at index time and can render as a reader view. */
const EXTRACTED_EXTENSIONS = [
  "docx",
  "doc",
  "txt",
  "md",
  "csv",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
];

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * How a document should be shown in-app, or null when the only sensible
 * action is opening it at the source.
 *
 * Images and PDFs render straight from their stored file, so they need one we
 * can point a browser at — uploads have a blob URL, Drive files do not. Text
 * types fall back to the content we already extracted for search, which works
 * regardless of where the file lives.
 */
export function previewKind(doc: {
  mimeType: string | null | undefined;
  fileName: string;
  source: string;
  url?: string | undefined;
}): PreviewKind | null {
  const type = (doc.mimeType || "").toLowerCase();
  const ext = extensionOf(doc.fileName);
  const isUpload = doc.source === "upload" && Boolean(doc.url);

  if (isUpload && (type.startsWith("image/") || IMAGE_EXTENSIONS.includes(ext))) {
    return "image";
  }
  if (isUpload && (type === "application/pdf" || ext === "pdf")) {
    return "pdf";
  }
  if (
    type.includes("wordprocessingml") ||
    type.includes("spreadsheetml") ||
    type.includes("presentationml") ||
    type.startsWith("text/") ||
    type.startsWith("application/vnd.google-apps.") ||
    type === "application/msword" ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.ms-powerpoint" ||
    EXTRACTED_EXTENSIONS.includes(ext)
  ) {
    return "extracted";
  }
  return null;
}

/** Whether a Word document — the one type worth converting to formatted HTML. */
export function isWordDocument(
  mimeType: string | null | undefined,
  fileName: string
): boolean {
  const type = (mimeType || "").toLowerCase();
  return (
    type.includes("wordprocessingml") || extensionOf(fileName) === "docx"
  );
}
