/**
 * Truncate text for a human or an LLM to read, without cutting a word in half.
 *
 * A plain `.slice(0, N)` — used throughout the embedding/search pipeline — can
 * land anywhere, including mid-word ("...3. Spir"). That reads as the source
 * document being corrupted or cut off, when it's really just an arbitrary
 * character-count boundary. This backs up from the cut point to the last
 * whitespace, so truncated content always ends on a word boundary.
 */
export function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const slice = text.slice(0, maxLength);
  const lastBreak = slice.lastIndexOf(" ") > slice.lastIndexOf("\n")
    ? slice.lastIndexOf(" ")
    : slice.lastIndexOf("\n");

  // No whitespace found at all (one long token) — fall back to the hard cut
  // rather than returning an empty string.
  const cut = lastBreak > maxLength * 0.5 ? lastBreak : maxLength;

  return slice.slice(0, cut).trimEnd() + "...";
}
