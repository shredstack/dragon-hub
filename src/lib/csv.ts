// CSV helpers for exporting tabular data to spreadsheet/email tools.

// Values starting with these characters are interpreted as formulas by Excel
// and Google Sheets. Prefix them so an exported cell can never execute.
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function escapeCell(value: string): string {
  let cell = value;
  if (FORMULA_PREFIXES.some((p) => cell.startsWith(p))) {
    cell = `'${cell}`;
  }
  if (/[",\n\r]/.test(cell) || cell !== cell.trim()) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Build a CSV string from ordered columns and row objects.
 * Rows are keyed by column key; missing values become empty cells.
 *
 * `notes` appends a blank row and then one line per note in the first column.
 * They travel with the file rather than living only in the dialog that produced
 * it — an exported roster gets forwarded, and what it does and doesn't contain
 * has to be readable by whoever opens it next.
 */
export function toCsv<K extends string>(
  columns: { key: K; label: string }[],
  rows: Record<K, string>[],
  options?: { notes?: string[] }
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key] ?? "")).join(",")
  );
  const notes = options?.notes?.length
    ? ["", ...options.notes.map((note) => escapeCell(note))]
    : [];
  return [header, ...body, ...notes].join("\r\n");
}

/**
 * Trigger a browser download of bytes that arrived base64-encoded — how a
 * binary export crosses a server action boundary, since an action returns JSON
 * and not a stream. Client-side only.
 *
 * The same anchor-and-revoke dance `downloadCsv` does, deliberately: it is the
 * path the native shell's WebView already handles, and a plain navigation to a
 * streaming route handler is the one it handles least well.
 */
export function downloadBase64(
  filename: string,
  base64: string,
  mimeType: string
): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  triggerDownload(filename, new Blob([bytes], { type: mimeType }));
}

/**
 * Trigger a browser download of CSV content. Client-side only.
 * A UTF-8 BOM is prepended so Excel renders accented names correctly.
 */
export function downloadCsv(filename: string, csv: string): void {
  // Escaped rather than literal: an invisible U+FEFF in source is the kind of
  // character an editor or a copy-paste quietly drops.
  triggerDownload(
    filename,
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" })
  );
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
