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

/**
 * Collapse a name to its comparison form: letters and digits only, singular.
 *
 * This is what makes "Book Fair", "bookfair", and "Book Fairs" compare equal.
 * Normalization alone only catches case and whitespace, so those three would
 * otherwise become three tags splitting the same content between them.
 */
function stem(name: string): string {
  const bare = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (bare.endsWith("ies") && bare.length > 4) return `${bare.slice(0, -3)}y`;
  if (bare.endsWith("es") && bare.length > 3) return bare.slice(0, -2);
  if (bare.endsWith("s") && !bare.endsWith("ss") && bare.length > 2) {
    return bare.slice(0, -1);
  }
  return bare;
}

/** Levenshtein distance, bailing out once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** How closely `query` matches `candidate` — lower is closer, null is no match. */
function similarityRank(query: string, candidate: string): number | null {
  if (query === candidate) return 0;

  const q = stem(query);
  const c = stem(candidate);
  if (!q || !c) return null;

  if (q === c) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 2;
  if (c.includes(q) || q.includes(c)) return 3;

  // A long shared prefix catches the different-suffix pairs edit distance
  // misses — "fundraising" vs "fundraiser" differ by 3 edits but are plainly
  // the same tag. Requiring most of the shorter name keeps "book fair" and
  // "book club" apart.
  let shared = 0;
  while (shared < q.length && shared < c.length && q[shared] === c[shared]) {
    shared++;
  }
  if (shared >= 5 && shared >= 0.6 * Math.min(q.length, c.length)) return 4;

  // Tolerate a typo or two, scaled to length so short tags don't match
  // everything ("art" is not a near-miss for "arts night" via edit distance).
  const tolerance = Math.min(q.length, c.length) <= 5 ? 1 : 2;
  const distance = editDistance(q, c, tolerance);
  return distance <= tolerance ? 5 : null;
}

/**
 * Find existing tags that a proposed name might duplicate.
 *
 * Used to surface near-misses while the user types, so a second "Fundraising"
 * never gets created alongside "Fundraiser". Exact matches (rank 0) come first.
 */
export function findSimilarTags<T extends { name: string }>(
  query: string,
  candidates: T[],
  limit = 5
): T[] {
  const normalized = query.toLowerCase().trim();
  if (!normalized) return [];

  return candidates
    .map((tag) => ({ tag, rank: similarityRank(normalized, tag.name) }))
    .filter((match): match is { tag: T; rank: number } => match.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.tag.name.localeCompare(b.tag.name))
    .slice(0, limit)
    .map((match) => match.tag);
}

/** True when `query` normalizes to exactly an existing tag name. */
export function isExactTagMatch(query: string, existing: string[]): boolean {
  const normalized = query.toLowerCase().trim();
  return !!normalized && existing.includes(normalized);
}
