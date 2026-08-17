/**
 * One emoji, whoever typed it.
 *
 * Every surface that stores an emoji takes free text — a paste from the system
 * keyboard, a tap on a suggestion, or whatever else lands in the box — so the
 * value has to be narrowed before it is stored. Client-safe on purpose: the
 * picker and the server action validate identically, so the form can't accept
 * something the action will quietly drop.
 */

/** A grapheme cluster is short; anything longer is a ZWJ chain being abused. */
const MAX_EMOJI_LENGTH = 32;

const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** The first grapheme cluster — a family or a flag counts as one, not four. */
function firstGrapheme(value: string): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const { segment } of segmenter.segment(value)) return segment;
    return "";
  }
  // Code points, not UTF-16 units, so a surrogate pair survives the fallback.
  return [...value][0] ?? "";
}

/**
 * The single emoji `value` starts with, or `null` for empty input and for
 * anything that isn't an emoji at all — a room named "🎈" is fun, a room named
 * "Mrs. Patel's room is the best" in the emoji slot is a broken layout.
 */
export function normalizeEmoji(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const first = firstGrapheme(trimmed);
  if (!first || first.length > MAX_EMOJI_LENGTH) return null;
  return EMOJI_PATTERN.test(first) ? first : null;
}

/** True when `value` is empty or a usable emoji — i.e. nothing to complain about. */
export function isEmojiOrEmpty(value: string): boolean {
  return !value.trim() || normalizeEmoji(value) !== null;
}
