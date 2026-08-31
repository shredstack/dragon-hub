import "server-only";

import { zipSync } from "fflate";

/**
 * Bundle several generated files into one download.
 *
 * The case that forced it is the roster pack: a school with thirty rooms is
 * thirty separate PDFs, one per classroom, and a board member is not going to
 * click a button thirty times — nor does one combined PDF work, because the
 * office sends each room's sheet to that room.
 *
 * **Stored, not deflated.** Everything that goes in here is already compressed
 * (a PDF is), so `level: 0` costs nothing in size and keeps the whole thing
 * fast enough to run inside a server action's request.
 */
export interface ZipEntry {
  /** Path inside the archive, extension included. Duplicates are suffixed. */
  name: string;
  content: Uint8Array;
}

/** Bytes for a base64 string, for an entry that arrived from a PDF renderer. */
export function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Zip the entries and return base64, the shape a server action can hand back.
 *
 * A binary export crosses the action boundary base64-encoded and downloads via
 * `downloadBase64`, exactly as the roster PDF does — see the Rosters section in
 * CLAUDE.md for why a streaming route handler is the wrong tool here.
 */
export function zipToBase64(entries: ZipEntry[]): string {
  const files: Record<string, Uint8Array> = {};
  const used = new Map<string, number>();

  for (const entry of entries) {
    // Two rooms genuinely can share a name ("Kindergarten" at a school that
    // doesn't name its rooms). `zipSync` takes a record, so a collision would
    // silently drop one file rather than produce a duplicate entry.
    const safe = safeEntryName(entry.name);
    const seen = used.get(safe) ?? 0;
    used.set(safe, seen + 1);
    files[seen === 0 ? safe : numberedName(safe, seen + 1)] = entry.content;
  }

  return Buffer.from(zipSync(files, { level: 0 })).toString("base64");
}

/**
 * Strip what a file name may not contain. Directory separators most of all: an
 * entry called `../x` is the classic zip-slip, and these names are built from
 * classroom names a board member typed.
 */
function safeEntryName(name: string): string {
  const cleaned = name
    .replace(/[\\/]/g, "-")
    .replace(/[\x00-\x1f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "file";
}

function numberedName(name: string, n: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}
