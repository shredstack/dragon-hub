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
 */
export function toCsv<K extends string>(
  columns: { key: K; label: string }[],
  rows: Record<K, string>[]
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key] ?? "")).join(",")
  );
  return [header, ...body].join("\r\n");
}

/**
 * Trigger a browser download of CSV content. Client-side only.
 * A UTF-8 BOM is prepended so Excel renders accented names correctly.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
