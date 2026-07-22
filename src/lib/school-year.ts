import { cache } from "react";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

/**
 * School year resolution.
 *
 * `school.currentSchoolYear` is the ONLY source of truth for what year a school
 * is operating in. The `CURRENT_SCHOOL_YEAR` constant is a last-resort fallback
 * for schools created before the column existed — it must never be used directly
 * in a membership query, because a school that has rolled over will disagree
 * with it and every year-scoped lookup silently returns nothing.
 *
 * Use `getSchoolCurrentYear(schoolId)` instead.
 */

/**
 * Generate a school year string from a start year
 * @example generateSchoolYear(2025) returns "2025-2026"
 */
export function generateSchoolYear(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

/**
 * Parse a school year string to get the start year
 * @example parseSchoolYear("2025-2026") returns 2025
 */
export function parseSchoolYear(schoolYear: string): number {
  return parseInt(schoolYear.split("-")[0], 10);
}

/**
 * Get the next school year from a given school year
 * @example getNextSchoolYear("2025-2026") returns "2026-2027"
 */
export function getNextSchoolYear(currentYear: string): string {
  const startYear = parseSchoolYear(currentYear);
  return generateSchoolYear(startYear + 1);
}

/**
 * Get the previous school year from a given school year
 * @example getPreviousSchoolYear("2026-2027") returns "2025-2026"
 */
export function getPreviousSchoolYear(currentYear: string): string {
  const startYear = parseSchoolYear(currentYear);
  return generateSchoolYear(startYear - 1);
}

/** Validate the YYYY-YYYY format and that the halves are consecutive. */
export function isValidSchoolYear(year: string): boolean {
  if (!/^\d{4}-\d{4}$/.test(year)) return false;
  const [start, end] = year.split("-").map(Number);
  return end === start + 1;
}

/** Assert a valid school year, throwing a user-facing error if not. */
export function assertValidSchoolYear(year: string): string {
  if (!isValidSchoolYear(year)) {
    throw new Error(
      `Invalid school year "${year}". Use consecutive years in YYYY-YYYY format (e.g., 2026-2027).`
    );
  }
  return year;
}

/** Sort school years newest-first. */
export function sortSchoolYearsDesc(years: string[]): string[] {
  return [...years].sort((a, b) => parseSchoolYear(b) - parseSchoolYear(a));
}

/**
 * Whether a row's school year belongs to the "current" period.
 *
 * Anything dated ahead of the school's active year counts as current rather
 * than vanishing from both the current and previous views, and an unparseable
 * year is treated as current so a bad row is never silently orphaned. Shared by
 * the Event Plans list and the dashboard so a tile and its destination page
 * can't disagree about which plans are yours right now.
 */
export function isCurrentOrLaterYear(
  rowYear: string,
  currentYearStart: number
): boolean {
  if (Number.isNaN(currentYearStart)) return true;
  const rowStart = parseSchoolYear(rowYear);
  return Number.isNaN(rowStart) || rowStart >= currentYearStart;
}

/**
 * The calendar dates a school year spans, as `YYYY-MM-DD` strings for
 * comparison against `date` columns.
 *
 * Volunteer hours are stamped with a real date rather than a school year, so
 * "hours given this year" needs a window. August 1 is the boundary: it's after
 * every district's last day and before every district's first.
 */
export function schoolYearDateRange(schoolYear: string): {
  start: string;
  end: string;
} {
  const startYear = parseSchoolYear(schoolYear);
  if (Number.isNaN(startYear)) {
    // Nothing sensible to bound by — take everything rather than nothing.
    return { start: "1970-01-01", end: "9999-12-31" };
  }
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` };
}

/**
 * Get default school years when a school has no configuration.
 * Returns the global constant and 5 years back.
 */
export function getDefaultSchoolYears(): { current: string; available: string[] } {
  const startYear = parseSchoolYear(CURRENT_SCHOOL_YEAR);
  const available: string[] = [];
  for (let i = 0; i <= 5; i++) {
    available.push(generateSchoolYear(startYear - i));
  }
  return {
    current: CURRENT_SCHOOL_YEAR,
    available,
  };
}

/**
 * Get the current school year for a specific school.
 *
 * Cached per-request so the many year-scoped queries in a single render don't
 * each pay a round trip.
 */
export const getSchoolCurrentYear = cache(async function getSchoolCurrentYear(
  schoolId: string
): Promise<string> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { currentSchoolYear: true },
  });

  return school?.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
});

/**
 * Get available school year options for a specific school.
 * Always includes the school's current year, even if the array is stale.
 */
export async function getSchoolYearOptions(schoolId: string): Promise<string[]> {
  const { currentYear, availableYears } = await getSchoolYearConfig(schoolId);
  return availableYears.includes(currentYear)
    ? availableYears
    : sortSchoolYearsDesc([currentYear, ...availableYears]);
}

/**
 * Get both current year and available options for a school.
 * Useful for forms that need both values.
 */
export const getSchoolYearConfig = cache(async function getSchoolYearConfig(
  schoolId: string
): Promise<{
  currentYear: string;
  availableYears: string[];
}> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: {
      currentSchoolYear: true,
      availableSchoolYears: true,
    },
  });

  const defaults = getDefaultSchoolYears();
  const currentYear = school?.currentSchoolYear ?? defaults.current;
  const availableYears =
    school?.availableSchoolYears && school.availableSchoolYears.length > 0
      ? school.availableSchoolYears
      : defaults.available;

  return {
    currentYear,
    availableYears: availableYears.includes(currentYear)
      ? sortSchoolYearsDesc(availableYears)
      : sortSchoolYearsDesc([currentYear, ...availableYears]),
  };
});
