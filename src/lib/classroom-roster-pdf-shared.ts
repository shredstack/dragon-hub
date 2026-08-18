/**
 * The rules the PDF roster and its buttons share.
 *
 * The PDF is the same export as the CSV, shaped for a page instead of a
 * spreadsheet, so it takes the same `ClassroomRosterExportInput` the dialog
 * already produces — and then overrides the three parts of it that only make
 * sense for a grid. Doing that here rather than in the action keeps the button
 * honest about what it will produce.
 *
 * Client-safe.
 */

import type { ClassroomRosterExportInput } from "@/lib/classroom-roster-export";
import { classroomRosterColumnsForFormat } from "@/lib/classroom-roster-export";

export interface RosterPdfResult {
  /** Without the extension; the client appends `.pdf`. */
  fileName: string;
  /** Base64-encoded PDF bytes, or empty when there was nothing to print. */
  base64: string;
  /** Distinct people on the sheet. Zero is why `base64` would be empty. */
  peopleCount: number;
}

/**
 * The export input a roster PDF is built from.
 *
 * Three overrides, each because a document is not a grid:
 *
 * - **Assignment format always.** The member format has already collapsed a
 *   person's commitments into one row and cannot be taken back apart into the
 *   sections a roster is made of.
 * - **Unfilled seats and every status, always.** "Room Parents — 1 of 2 spots
 *   filled" is the line the room parent VP is reading the sheet for, and it
 *   can only be printed if the export was allowed to return the empty seat and
 *   the waitlist behind it.
 * - **Every column the format allows.** The column checkboxes decide what the
 *   CSV's header row says; the PDF's layout is fixed, and dropping Phone from
 *   the picker shouldn't silently blank a column of the printed sheet.
 *
 * What it *does* keep is the assignment-type filter, so the "Room parents"
 * preset still produces a room parents sheet rather than the whole room — with
 * the teachers added back, because on a printed sheet whose teacher it is
 * belongs to the room's identity rather than to what was filtered for.
 */
export function rosterPdfFilters(
  input: ClassroomRosterExportInput
): ClassroomRosterExportInput {
  const types = input.assignmentTypes;
  return {
    ...input,
    format: "assignment",
    // Empty already means every classroom type, teachers among them.
    assignmentTypes:
      types.length > 0 && !types.includes("teacher")
        ? [...types, "teacher"]
        : types,
    statuses: [],
    includeUnfilledSpots: true,
    columns: classroomRosterColumnsForFormat("assignment").map((c) => c.key),
  };
}

/** `Bentley roster` → the basename the download lands under. */
export function rosterPdfFileName(label: string): string {
  const cleaned = label.replace(/[^\w\s-]/g, "").trim();
  return `${cleaned || "classroom"} roster`;
}
