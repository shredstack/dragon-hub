/**
 * Finding `@Name` in a message.
 *
 * Client-safe: no DB, no `server-only`. The caller supplies the candidate list
 * — always the recipients of the board being posted on, never every user — so
 * a mention can only ever reach someone who could already read the message.
 * That constraint is the whole security model here; keep it at the call sites.
 *
 * Matching is deliberately simple, because the alternative (a mention picker
 * writing an opaque token into the message body) is a much larger change to
 * every message input in the app, and this is what people actually type.
 */

export interface MentionCandidate {
  userId: string;
  /** The person's display name. Rows with no name are skipped. */
  name: string | null | undefined;
}

/**
 * User ids mentioned in `text`.
 *
 * **Longest name first.** A board containing both "Sarah" and "Sarah Dorich"
 * must resolve `@Sarah Dorich` to Sarah Dorich, not to Sarah plus a stray
 * "Dorich" — so candidates are sorted by name length descending and each match
 * consumes its span before the shorter names are tried.
 *
 * Also matches a bare first name (`@Sarah`), but only when it is unambiguous:
 * two people whose first name is Sarah means `@Sarah` matches neither, because
 * notifying the wrong Sarah is worse than notifying nobody.
 */
export function extractMentions(
  text: string,
  candidates: MentionCandidate[]
): string[] {
  if (!text.includes("@")) return [];

  const named = candidates.filter(
    (c): c is { userId: string; name: string } => !!c.name?.trim()
  );
  if (named.length === 0) return [];

  // Full names, longest first.
  const targets: Array<{ userId: string; token: string }> = named.map((c) => ({
    userId: c.userId,
    token: c.name.trim(),
  }));

  // Unambiguous first names, as a fallback.
  const firstNameCounts = new Map<string, number>();
  for (const c of named) {
    const first = c.name.trim().split(/\s+/)[0].toLowerCase();
    firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }
  for (const c of named) {
    const first = c.name.trim().split(/\s+/)[0];
    if (
      firstNameCounts.get(first.toLowerCase()) === 1 &&
      first.toLowerCase() !== c.name.trim().toLowerCase()
    ) {
      targets.push({ userId: c.userId, token: first });
    }
  }

  targets.sort((a, b) => b.token.length - a.token.length);

  // Consumed spans, so a longer name's match can't be re-matched by a shorter
  // one sitting inside it.
  const consumed: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    consumed.some(([s, e]) => start < e && end > s);

  const found = new Set<string>();
  const haystack = text.toLowerCase();

  for (const target of targets) {
    const needle = `@${target.token.toLowerCase()}`;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      const end = at + needle.length;
      // The character after the name must not be a word character, or
      // `@Sam` would match inside `@Samantha`.
      const next = text[end];
      const boundaryOk = next === undefined || !/[\p{L}\p{N}]/u.test(next);
      if (boundaryOk && !overlaps(at, end)) {
        consumed.push([at, end]);
        found.add(target.userId);
        from = end;
      } else {
        from = at + 1;
      }
    }
  }

  return [...found];
}
