import { anthropic } from "@/lib/ai/client";

// Matches the cap used by the Drive sync (src/lib/sync/drive-indexer.ts) so
// uploaded and synced documents contribute comparable weight to search ranking.
export const MAX_CONTENT_LENGTH = 10000;

// Below this many characters a PDF is almost certainly a scan or an
// image-only export, so the embedded text layer is worthless and we fall back
// to reading it with Claude.
const SCANNED_PDF_THRESHOLD = 200;

// Claude's document input tops out well below our 25MB upload cap; skip the
// vision fallback for anything larger rather than failing the whole upload.
const MAX_VISION_BYTES = 20 * 1024 * 1024;

const VISION_MODEL = "claude-sonnet-4-20250514";

export const SUPPORTED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc (legacy — text extraction is best-effort)
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

// Browsers leave File.type empty for extensions they don't recognize (common
// for .md and .csv on Windows), so the extension is the only signal left.
const SUPPORTED_UPLOAD_EXTENSIONS = [
  "pdf",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "txt",
  "md",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
];

/**
 * Whether an upload is a type we can store and extract text from.
 *
 * Falls back to the file extension when the browser sends no MIME type — an
 * unknown type must never mean "skip validation".
 */
export function isSupportedUpload(
  mimeType: string | null | undefined,
  fileName: string
): boolean {
  if (mimeType) {
    return (
      SUPPORTED_UPLOAD_MIME_TYPES.includes(mimeType) ||
      mimeType.startsWith("text/")
    );
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  return Boolean(ext && SUPPORTED_UPLOAD_EXTENSIONS.includes(ext));
}

function truncate(text: string): string {
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > MAX_CONTENT_LENGTH
    ? cleaned.slice(0, MAX_CONTENT_LENGTH)
    : cleaned;
}

/**
 * Read a PDF's embedded text layer. Returns "" for scanned PDFs.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

/**
 * Read a document with Claude when there is no machine-readable text layer:
 * scanned PDFs, photos of paper handouts, whiteboard shots.
 */
async function extractWithVision(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  if (buffer.byteLength > MAX_VISION_BYTES) return "";

  const base64 = buffer.toString("base64");
  const source =
    mimeType === "application/pdf"
      ? ({
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64,
          },
        })
      : ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif",
            data: base64,
          },
        });

  const message = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          source,
          {
            type: "text",
            text: `Transcribe all text content from this document ("${fileName}") as plain text.

This transcription is indexed so that future PTA volunteers can search it and so AI can reference it when planning next year's events. Accuracy matters more than polish.

- Transcribe faithfully. Do not summarize, interpret, or add commentary.
- Preserve headings, lists, and table structure using plain text formatting.
- Render tables row by row with columns separated by " | ".
- Mark unreadable text as [illegible].
- Output only the transcription, with no preamble.`,
          },
        ],
      },
    ],
  });

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("\n");
}

/**
 * Extract searchable plain text from an uploaded document.
 *
 * Returns null when the format carries no extractable text — the document is
 * still indexed and downloadable, it just won't match on content.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string | null,
  fileName: string
): Promise<string | null> {
  const type = (mimeType || "").toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  try {
    // Plain text formats — decode directly.
    if (
      type.startsWith("text/") ||
      type === "application/json" ||
      ["txt", "md", "markdown", "csv", "json"].includes(ext)
    ) {
      return truncate(buffer.toString("utf-8")) || null;
    }

    if (type === "application/pdf" || ext === "pdf") {
      const text = await extractPdfText(buffer);
      if (text.trim().length >= SCANNED_PDF_THRESHOLD) return truncate(text);
      // No usable text layer — this is a scan.
      const transcribed = await extractWithVision(buffer, "application/pdf", fileName);
      return truncate(transcribed || text) || null;
    }

    if (
      type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return truncate(value) || null;
    }

    if (
      type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      type === "application/vnd.ms-excel" ||
      ["xlsx", "xls"].includes(ext)
    ) {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

      const parts: string[] = [];
      workbook.eachSheet((sheet) => {
        parts.push(`## ${sheet.name}`);
        sheet.eachRow((row) => {
          const cells = (row.values as unknown[])
            .slice(1)
            .map((v) => cellToString(v));
          if (cells.some((c) => c.length > 0)) parts.push(cells.join(" | "));
        });
      });
      return truncate(parts.join("\n")) || null;
    }

    if (type.startsWith("image/")) {
      const transcribed = await extractWithVision(buffer, type, fileName);
      return truncate(transcribed) || null;
    }

    // PPTX, legacy .doc, and anything else: indexed by filename only.
    return null;
  } catch (error) {
    console.error(`Text extraction failed for ${fileName} (${type}):`, error);
    return null;
  }
}

/** ExcelJS cell values can be rich text, formula results, dates, or hyperlinks. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;
    if (v.result !== undefined) return String(v.result);
    if (Array.isArray(v.richText)) {
      return v.richText.map((r) => (r as { text: string }).text).join("");
    }
    if (typeof v.hyperlink === "string") return v.hyperlink;
    return "";
  }
  return String(value);
}
