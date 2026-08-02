// Shared helpers for parsing/formatting/ordering classroom grade levels.
//
// `classrooms.grade_level` is free text, and always has been: the admin form
// writes the labels in `GRADE_LEVELS` ("Kindergarten", "1st Grade"), while
// seeded and imported rooms carry the shorthand a school actually types ("K",
// "2nd"). Both spellings are alive in production data.
//
// That is why sorting grades in SQL is always wrong. `ORDER BY grade_level`
// is alphabetical, which puts 1st Grade before Kindergarten and 10th–12th
// before 1st. Every grade ordering in the app must go through
// `getGradeSortOrder` / `sortClassroomsByGrade` below, which normalize the
// spellings first. There is no SQL equivalent — sort in JS after the read.

// Helper to parse grade level for sorting
export function getGradeSortOrder(gradeLevel: string | null): number {
  if (!gradeLevel) return 999; // Unassigned goes last
  const normalized = gradeLevel.toLowerCase().trim();
  if (normalized === "k" || normalized === "kindergarten") return 0;
  if (normalized === "pre-k" || normalized === "prek") return -1;
  // Transitional kindergarten sits between the two, so it gets a fractional
  // slot rather than a renumbering of every grade below it.
  if (normalized === "tk" || normalized === "transitional kindergarten")
    return -0.5;
  const numMatch = normalized.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 998; // Unknown grades before unassigned
}

// Helper to format grade level for display
export function formatGradeLevel(gradeLevel: string | null): string {
  if (!gradeLevel) return "Unassigned";
  const normalized = gradeLevel.toLowerCase().trim();
  if (normalized === "k" || normalized === "kindergarten") return "Kindergarten";
  if (normalized === "pre-k" || normalized === "prek") return "Pre-K";
  if (normalized === "tk" || normalized === "transitional kindergarten")
    return "TK";
  const numMatch = normalized.match(/^(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const suffix = num === 1 ? "st" : num === 2 ? "nd" : num === 3 ? "rd" : "th";
    return `${num}${suffix} Grade`;
  }
  return gradeLevel; // Return as-is if no match
}

/** The shape every grade-ordered list has in common. */
type GradedRoom = { gradeLevel: string | null; name: string };

/**
 * Grade first, then room name — the order every classroom list wants.
 *
 * Names collate numerically so "Room 2" precedes "Room 10", which the SQL
 * `ORDER BY name` this replaces got wrong too, just less visibly.
 */
export function compareByGradeThenName(a: GradedRoom, b: GradedRoom): number {
  const byGrade =
    getGradeSortOrder(a.gradeLevel) - getGradeSortOrder(b.gradeLevel);
  if (byGrade !== 0) return byGrade;
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

/** Copy of `rooms` in canonical grade order. Does not mutate the input. */
export function sortClassroomsByGrade<T extends GradedRoom>(rooms: T[]): T[] {
  return [...rooms].sort(compareByGradeThenName);
}

export interface GradeGroup<T> {
  /** Stable key for React and for remembering the section's open state. */
  key: string;
  /** Display label, e.g. "Kindergarten". */
  label: string;
  classrooms: T[];
}

/**
 * Group rooms under their grade, in canonical grade order.
 *
 * Grouping is by *formatted* label, so a school with both "K" and
 * "Kindergarten" rooms gets one Kindergarten section rather than two. Ordering
 * still comes from a raw value, because "Unassigned" is a label with no grade
 * in it and would otherwise sort as an unknown grade instead of last.
 */
export function groupClassroomsByGrade<T extends GradedRoom>(
  rooms: T[]
): Array<GradeGroup<T>> {
  const groups = new Map<string, { sortOrder: number; classrooms: T[] }>();

  for (const room of rooms) {
    const label = formatGradeLevel(room.gradeLevel);
    const existing = groups.get(label);
    if (existing) {
      existing.classrooms.push(room);
    } else {
      groups.set(label, {
        sortOrder: getGradeSortOrder(room.gradeLevel),
        classrooms: [room],
      });
    }
  }

  return [...groups.entries()]
    .sort(
      ([labelA, a], [labelB, b]) =>
        a.sortOrder - b.sortOrder || labelA.localeCompare(labelB)
    )
    .map(([label, group]) => ({
      key: label,
      label,
      classrooms: group.classrooms.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      ),
    }));
}
