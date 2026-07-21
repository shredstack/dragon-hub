/**
 * Tag helpers shared by every taggable entity.
 *
 * Tags are stored on content rows as a `text[]` of *normalized* names, with the
 * `tags` table holding the display name and usage count. Normalizing at every
 * write is what keeps "Field Day", "field day", and " Field Day " from becoming
 * three tags that each match a third of the content.
 */

/**
 * Lowercase, trim, drop blanks, and de-duplicate — the storage form.
 */
export function normalizeTags(
  input: string[] | null | undefined
): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    const name = raw.toLowerCase().trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

/**
 * Parse a comma-separated tag string into normalized names.
 */
export function parseTagInput(value: string): string[] {
  return normalizeTags(value.split(","));
}
