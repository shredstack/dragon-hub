/**
 * Client-safe rules for a classroom's list of teachers.
 *
 * A room can have more than one teacher — a half-day room is taught by one
 * person in the morning and another in the afternoon — so "the teacher" is a
 * list everywhere, and a list of one is just the ordinary case.
 *
 * These live apart from `classroom-teachers.ts` so the admin form validates the
 * same way the server action does. Nothing here touches the database.
 */

/** One row of the board's teacher list, as it comes back from the database. */
export interface ClassroomTeacher {
  id: string;
  name: string | null;
  email: string;
  sortOrder: number;
}

/** What a form submits: an address, and optionally the name to print. */
export interface ClassroomTeacherInput {
  name?: string | null;
  email: string;
}

/**
 * Trim, lowercase, drop the blanks, and drop the duplicates.
 *
 * Addresses are lowercased because that is how they are stored (see the
 * `classroom_teachers` comment in `schema.ts`) and because a board member who
 * types `Patterson@draper.edu` on one room and `patterson@draper.edu` on
 * another must reach the same teacher.
 *
 * Duplicates are dropped rather than rejected: two rows for the same teacher is
 * a slip in a repeatable form, not something worth an error message. The first
 * one wins, so the name typed beside it survives.
 */
export function normalizeTeacherInputs(
  inputs: ClassroomTeacherInput[]
): Array<{ name: string | null; email: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string | null; email: string }> = [];

  for (const input of inputs) {
    const email = input.email?.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name: input.name?.trim() || null, email });
  }

  return out;
}

/** Roughly what a browser's `type="email"` accepts, and nothing sillier. */
export function isLikelyEmail(value: string): boolean {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * The addresses in `inputs` that aren't email addresses at all.
 *
 * Worth checking on the server as well as in the form: this field is what puts
 * a teacher inside their room, and a typo fails silently otherwise.
 */
export function invalidTeacherEmails(inputs: ClassroomTeacherInput[]): string[] {
  return normalizeTeacherInputs(inputs)
    .map((t) => t.email)
    .filter((email) => !isLikelyEmail(email));
}

/**
 * What to print for one teacher: their name if anyone has told us one, else
 * their address. Never blank.
 */
export function teacherDisplayName(teacher: {
  name: string | null;
  email: string;
}): string {
  return teacher.name?.trim() || teacher.email;
}

/**
 * "Mrs. Patterson and Mr. Lee" — the room's teachers as one phrase.
 *
 * Comma-separated past two, because a DLI room plus a half-day split can
 * genuinely reach three. Returns "" for a room with no teacher set, so callers
 * can test it directly.
 */
export function formatTeacherNames(
  teachers: Array<{ name: string | null; email: string }>
): string {
  const names = teachers.map(teacherDisplayName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
