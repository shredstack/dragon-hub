/**
 * Student names — the one piece of data in DragonHub that is about a child.
 *
 * Everything else the app holds is about a grown-up: a parent's name, their
 * phone, which room they volunteered for. This is not, so it carries its own
 * rule, and the rule is short:
 *
 * **A student name is visible to the PTA board and to the parent who entered
 * it. Nobody else — not a teacher, not a room parent, not a school admin.**
 *
 * That is stricter than the phone-number rule, which lets any classroom member
 * see the contacts for their own room, and stricter than the school-admin line
 * drawn everywhere else in the app (see "Participation vs Governance" in
 * CLAUDE.md). It is deliberate: a room's volunteers coordinating a party have
 * no need for the roster of whose kid is whose, and the cost of being wrong
 * about a child is not the same as the cost of being wrong about an adult.
 *
 * Consequences that live elsewhere and are easy to break:
 *
 * - **Filter on the server, in the projection**, exactly as
 *   `showReactorNames` does for Our Events. A student name that reaches the
 *   browser and is hidden with a CSS class has already been disclosed. There
 *   is no `students` field on the classroom page's payload, the committee
 *   roster's payload, or the school directory's payload — not an empty one, an
 *   absent one.
 * - **Exports are opt-in, twice over.** The column is board-only *and* off by
 *   default (`OPT_IN_EXPORT_COLUMNS` in `member-export.ts`), so a board member
 *   who runs the roster export to email the room parents does not accidentally
 *   put a list of children into an attachment. Ticking the box is the act that
 *   says "I meant to".
 * - **Every field is optional except the name.** A parent who wants to write
 *   "Ava" and nothing else is giving the board what they asked for; grade and
 *   classroom are conveniences for matching a volunteer to a room, not a
 *   questionnaire to complete.
 *
 * Client-safe: the signup forms, the profile editor and the server actions all
 * normalize with the same functions, so what a form accepts and what the
 * database stores cannot drift.
 */

/**
 * One child, as entered by their parent.
 *
 * `classroomId` points at a **current-year** `classrooms` row. Classrooms are
 * re-created every school year, so a stale id resolves to nothing and renders
 * as a name with no room rather than as last year's room — which is the honest
 * answer, and the reason this isn't worth a rollover job.
 */
export interface StudentEntry {
  name: string;
  /** Free text, same vocabulary as `classrooms.grade_level`. */
  gradeLevel: string | null;
  /** A `classrooms.id`, or null when the parent didn't say. */
  classroomId: string | null;
}

/** More than this and the field is being used for something it isn't. */
export const MAX_STUDENTS_PER_MEMBER = 10;
export const MAX_STUDENT_NAME_LENGTH = 80;
export const MAX_GRADE_LEVEL_LENGTH = 40;

/** Shown wherever a parent is asked for this, and in the board's own UI. */
export const STUDENT_PRIVACY_NOTE =
  "Optional. Student names are visible only to you and the PTA board — never to other parents, room parents or teachers.";

/** The heading the field carries on every surface that asks for it. */
export const STUDENT_FIELD_LABEL = "Your student(s)";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimTo(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

/**
 * Narrow anything into a storable list of students.
 *
 * Runs on the way in from a form *and* again in the server action, for the same
 * reason `normalizeEmoji()` does: the field is free text, and the form's rules
 * are a courtesy rather than a gate. Entries with a blank name are dropped —
 * that is how a parent deletes a row they added by mistake, and it means a
 * grade with no child attached can never be stored.
 */
export function normalizeStudents(input: unknown): StudentEntry[] {
  if (!Array.isArray(input)) return [];
  const out: StudentEntry[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const name = trimTo(source.name, MAX_STUDENT_NAME_LENGTH);
    if (!name) continue;

    // Two rows for one child is a double-tap on "Add another", not twins with
    // the same first name in the same grade.
    const gradeLevel =
      trimTo(source.gradeLevel, MAX_GRADE_LEVEL_LENGTH) || null;
    const classroomIdRaw = trimTo(source.classroomId, 64);
    const classroomId = UUID_RE.test(classroomIdRaw) ? classroomIdRaw : null;
    const dedupeKey = `${name.toLowerCase()}|${(gradeLevel ?? "").toLowerCase()}|${classroomId ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({ name, gradeLevel, classroomId });
    if (out.length >= MAX_STUDENTS_PER_MEMBER) break;
  }

  return out;
}

/** The key two lists of students are merged on. Name only — see `mergeStudents`. */
export function studentIdentity(entry: StudentEntry): string {
  return entry.name.trim().toLowerCase();
}

/**
 * Fold `incoming` into `existing`, filling blanks and never overwriting.
 *
 * The same semantics as `upsertPerson` in the member export: a parent who
 * signs up for a second room this year and types their child's name again
 * should not lose the grade they set on their profile, and should not get a
 * second copy of that child. Matching is on the name alone — a signup form
 * asks for less than the profile does, so requiring the grade to match too
 * would make every partial entry a new child.
 */
export function mergeStudents(
  existing: StudentEntry[],
  incoming: StudentEntry[]
): StudentEntry[] {
  const merged = existing.map((e) => ({ ...e }));
  const byName = new Map(merged.map((e) => [studentIdentity(e), e]));

  for (const entry of incoming) {
    const match = byName.get(studentIdentity(entry));
    if (match) {
      if (!match.gradeLevel && entry.gradeLevel) {
        match.gradeLevel = entry.gradeLevel;
      }
      if (!match.classroomId && entry.classroomId) {
        match.classroomId = entry.classroomId;
      }
      continue;
    }
    if (merged.length >= MAX_STUDENTS_PER_MEMBER) break;
    const copy = { ...entry };
    merged.push(copy);
    byName.set(studentIdentity(copy), copy);
  }

  return merged;
}

/** What a classroom id resolves to for display. */
export type ClassroomNameLookup = (
  classroomId: string
) => { name: string; gradeLevel: string | null } | undefined;

/**
 * "Ava Chen (2nd Grade — Room 12)", degrading gracefully all the way down to
 * "Ava Chen" when the parent gave nothing else, or when the classroom is from
 * an earlier year and no longer resolves.
 */
export function formatStudent(
  entry: StudentEntry,
  lookup?: ClassroomNameLookup,
  formatGrade: (grade: string) => string = (g) => g
): string {
  const room = entry.classroomId ? lookup?.(entry.classroomId) : undefined;
  const grade = entry.gradeLevel ?? room?.gradeLevel ?? null;
  const parts = [grade ? formatGrade(grade) : null, room?.name ?? null].filter(
    Boolean
  );
  return parts.length > 0 ? `${entry.name} (${parts.join(" — ")})` : entry.name;
}

/** The same, joined for a table cell or a CSV column. */
export function formatStudents(
  entries: StudentEntry[],
  lookup?: ClassroomNameLookup,
  formatGrade?: (grade: string) => string
): string {
  return entries.map((e) => formatStudent(e, lookup, formatGrade)).join("; ");
}

/** An empty row for the "Add another" button to render. */
export function blankStudent(): StudentEntry {
  return { name: "", gradeLevel: null, classroomId: null };
}
