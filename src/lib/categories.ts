/**
 * One shape for every fixed category list in the app.
 *
 * Categories used to come in two shapes: lists of display strings whose *label*
 * was written to the database, and slug→label records whose *slug* was written.
 * Storing the label meant a category could never be renamed — "Office Help"
 * becoming "Front Office" would orphan every row filed under the old spelling —
 * so they are all slug→label records now, and `categoryLabel` is what turns a
 * stored slug back into text.
 *
 * These are platform-wide slates, deliberately unlike board positions and
 * budget categories, which each school owns rows for. If a category set ever
 * needs to be school-configurable, that is a table, not a longer constant.
 *
 * Client-safe.
 */

export type CategorySet = Readonly<Record<string, string>>;

/**
 * Display text for a stored category value.
 *
 * Falls back to the raw value rather than rendering nothing, so a value that
 * predates its set — one an AI generator invented, one left behind by a
 * half-run backfill — stays readable on the page instead of vanishing.
 * Returns null for null/empty so callers can skip the badge entirely.
 */
export function categoryLabel(
  set: CategorySet,
  value: string | null | undefined
): string | null {
  if (!value) return null;
  return set[value] ?? value;
}

export function categoryOptions(
  set: CategorySet
): Array<{ value: string; label: string }> {
  return Object.entries(set).map(([value, label]) => ({ value, label }));
}

/** The slugs of a set — what a JSON Schema `enum` or a validity check wants. */
export function categoryValues(set: CategorySet): string[] {
  return Object.keys(set);
}

export function isCategoryOf(
  set: CategorySet,
  value: string | null | undefined
): boolean {
  return !!value && value in set;
}

/**
 * The set's slug for a piece of display text, if it has one.
 *
 * Exists for the boundaries where text arrives instead of a slug — a model that
 * answered with the label, an import, a legacy row being edited.
 */
export function categorySlugFromLabel(
  set: CategorySet,
  label: string | null | undefined
): string | null {
  if (!label) return null;
  const match = Object.entries(set).find(
    ([, l]) => l.toLowerCase() === label.trim().toLowerCase()
  );
  return match?.[0] ?? null;
}
