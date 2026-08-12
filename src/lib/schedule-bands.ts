/**
 * Material bands — how many classrooms a committee can run at once, and which
 * classrooms compete with each other for the privilege.
 *
 * Meet the Masters is the case this exists for. The school owns **one junior
 * kit** (K–2) and **one senior kit** (3–5), so two kindergarten rooms booking
 * the same Tuesday morning is a real collision, while a kindergarten room and a
 * fourth grade room on that same Tuesday is completely fine — different kit.
 *
 * The plain overlap warning that shipped before this could not tell those two
 * apart: it compared every confirmed slot against every other, so the fine case
 * warned and the broken case looked exactly the same. A band is what makes the
 * difference expressible.
 *
 * A band is **a grade range plus how many of its rooms may overlap**. Grades are
 * held as `getGradeSortOrder` values (K = 0, 1st = 1, …) rather than the labels,
 * because `classrooms.grade_level` is free text and "1st" and "1st Grade" are
 * both alive in production — see `grade-levels.ts`.
 *
 * Client-safe: no db imports, so the admin form and the server-side conflict
 * check share one set of rules.
 */

import { getGradeSortOrder } from "@/lib/grade-levels";

export interface ScheduleBand {
  /** Stable key, so editing a band's label doesn't orphan anything. */
  id: string;
  /** What the school calls it: "Junior kit", "Senior kit". */
  label: string;
  /** Inclusive grade range, as `getGradeSortOrder` values. */
  minGrade: number;
  maxGrade: number;
  /**
   * How many of this band's classrooms may be scheduled at overlapping times —
   * i.e. how many kits the school owns. Almost always 1, which is the whole
   * reason the constraint exists.
   */
  concurrentLimit: number;
}

/** No bands configured. Kept explicit so `null` and `[]` mean the same thing. */
export const NO_SCHEDULE_BANDS: ScheduleBand[] = [];

/**
 * The band a grade falls in, or null when no band claims it.
 *
 * A grade in no band is deliberately *unconstrained* rather than lumped into a
 * default one: a school that defines a Junior band and nothing else has said
 * something about K–2 and nothing at all about 3–5, and inventing a limit for
 * 3–5 would produce warnings nobody asked for.
 */
export function bandForGrade(
  bands: ScheduleBand[] | null | undefined,
  gradeLevel: string | null
): ScheduleBand | null {
  if (!bands?.length || !gradeLevel) return null;
  const order = getGradeSortOrder(gradeLevel);
  // 998/999 mean "unparseable" / "unset" — not a grade, so not in any band.
  if (order >= 998) return null;
  return (
    bands.find((band) => order >= band.minGrade && order <= band.maxGrade) ??
    null
  );
}

/** "K", "1st Grade" … for the grade-range pickers. */
export const BAND_GRADE_CHOICES: Array<{ value: number; label: string }> = [
  { value: -1, label: "Pre-K" },
  { value: -0.5, label: "TK" },
  { value: 0, label: "Kindergarten" },
  { value: 1, label: "1st Grade" },
  { value: 2, label: "2nd Grade" },
  { value: 3, label: "3rd Grade" },
  { value: 4, label: "4th Grade" },
  { value: 5, label: "5th Grade" },
  { value: 6, label: "6th Grade" },
  { value: 7, label: "7th Grade" },
  { value: 8, label: "8th Grade" },
];

export function gradeChoiceLabel(value: number): string {
  return (
    BAND_GRADE_CHOICES.find((choice) => choice.value === value)?.label ??
    String(value)
  );
}

/** "Junior kit · Kindergarten–2nd Grade · 1 at a time" */
export function describeBand(band: ScheduleBand): string {
  const range =
    band.minGrade === band.maxGrade
      ? gradeChoiceLabel(band.minGrade)
      : `${gradeChoiceLabel(band.minGrade)}–${gradeChoiceLabel(band.maxGrade)}`;
  return `${range} · ${band.concurrentLimit} at a time`;
}

/**
 * Validation shared by the admin form and the server action.
 *
 * Overlapping bands are rejected rather than resolved by precedence: two bands
 * both claiming 2nd grade have no defensible answer, and `bandForGrade`
 * returning whichever came first in an array would be a silent coin flip.
 */
export function validateScheduleBands(bands: ScheduleBand[]): string | null {
  for (const band of bands) {
    if (!band.label.trim()) return "Every band needs a name.";
    if (band.minGrade > band.maxGrade) {
      return `"${band.label}" starts at a higher grade than it ends.`;
    }
    if (!Number.isInteger(band.concurrentLimit) || band.concurrentLimit < 1) {
      return `"${band.label}" needs to allow at least one classroom at a time.`;
    }
  }

  const sorted = [...bands].sort((a, b) => a.minGrade - b.minGrade);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minGrade <= sorted[i - 1].maxGrade) {
      return `"${sorted[i - 1].label}" and "${sorted[i].label}" cover some of the same grades.`;
    }
  }

  return null;
}
