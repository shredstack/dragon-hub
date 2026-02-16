import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

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
 * Falls back to global constant if school has no configuration.
 */
export async function getSchoolCurrentYear(schoolId: string): Promise<string> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { currentSchoolYear: true },
  });

  return school?.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
}

/**
 * Get available school year options for a specific school.
 * Falls back to default years if school has no configuration.
 */
export async function getSchoolYearOptions(schoolId: string): Promise<string[]> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { availableSchoolYears: true },
  });

  if (school?.availableSchoolYears && school.availableSchoolYears.length > 0) {
    return school.availableSchoolYears;
  }

  return getDefaultSchoolYears().available;
}

/**
 * Get both current year and available options for a school.
 * Useful for forms that need both values.
 */
export async function getSchoolYearConfig(schoolId: string): Promise<{
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

  return {
    currentYear: school?.currentSchoolYear ?? defaults.current,
    availableYears:
      school?.availableSchoolYears && school.availableSchoolYears.length > 0
        ? school.availableSchoolYears
        : defaults.available,
  };
}
