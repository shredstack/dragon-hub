/**
 * The rules for a reaction on a recurring event, in one client-safe place.
 *
 * The picker and the server action have to agree on what a reaction *is*, the
 * same bargain `src/lib/emoji.ts` makes: the box takes free text, so the form's
 * validation is a courtesy and the action's is the gate — and both have to
 * narrow identically or a parent's heart silently turns into a different heart.
 *
 * **Never import `src/lib/emoji-data.ts` from a reaction surface.** It is
 * ~130KB and `EmojiPicker` already lazy-loads it behind "Browse all". A
 * reaction bar renders stored graphemes directly and labels its buttons
 * `React with ❤️` — no name lookup, no dataset.
 */

import { normalizeEmoji } from "@/lib/emoji";

/**
 * The one-tap shortlist, handed to `EmojiPicker` as `suggestions`. Keep it
 * short: four reactions is playful, twelve is a chore.
 */
export const SUGGESTED_EVENT_REACTIONS = ["❤️", "🎉", "🙌", "🐉"] as const;

/** How many distinct emoji one person may put on one event. */
export const MAX_REACTIONS_PER_PERSON = 3;

/** At most this many distinct emoji render on a card before "+n more". */
export const MAX_REACTIONS_SHOWN = 4;

/** Skin-tone modifiers, U+1F3FB–U+1F3FF. */
const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/gu;

/** The variation selector that asks for the emoji rendering rather than text. */
const EMOJI_PRESENTATION = "️";

/**
 * The stored form of a reaction, or null for anything that isn't an emoji.
 *
 * `normalizeEmoji()` already narrows free text to one grapheme. Two more things
 * matter here and nowhere else, because this value is a *grouping key*:
 *
 *  - skin-tone modifiers are stripped, so 🙌🏽 and 🙌🏻 are one count rather than
 *    two. (The picker's own dataset already drops them; a system keyboard does
 *    not.)
 *  - the emoji-presentation selector U+FE0F is *added* to a bare
 *    single-codepoint emoji, so a pasted "❤" groups with the picker's "❤️"
 *    instead of splitting the count — and renders as a heart rather than as
 *    text on Windows.
 */
export function canonicalizeReaction(value: string): string | null {
  const emoji = normalizeEmoji(value);
  if (!emoji) return null;

  const withoutTone = emoji.replace(SKIN_TONE, "");
  if (!withoutTone) return null;

  // Only a *bare* single codepoint gets the selector. A ZWJ sequence or a flag
  // carries its own presentation and must be left exactly as it came in.
  const codePoints = [...withoutTone];
  if (codePoints.length === 1) return withoutTone + EMOJI_PRESENTATION;

  return withoutTone;
}

/**
 * Reaction counts in the order a card shows them: most-loved first, and the
 * ones this person tapped kept visible even when they'd fall past the cut.
 *
 * Client and server both call it — the server to decide what to send, the bar
 * to decide what to render after an optimistic tap — so the "+n more" number
 * can't disagree with the pills beside it.
 */
export interface ReactionTally {
  reaction: string;
  count: number;
  /** Whether the person reading the page is one of the count. */
  mine: boolean;
}

export function visibleReactions(
  tallies: ReactionTally[],
  limit = MAX_REACTIONS_SHOWN
): { shown: ReactionTally[]; hidden: number } {
  const ordered = [...tallies].sort(
    (a, b) => b.count - a.count || a.reaction.localeCompare(b.reaction)
  );
  const shown = ordered.slice(0, limit);
  const mineBelow = ordered.slice(limit).filter((t) => t.mine);
  // Someone who taps a rare emoji must keep seeing their own tap, or the button
  // reads as though it didn't work.
  const withMine = [...shown, ...mineBelow];
  return { shown: withMine, hidden: ordered.length - withMine.length };
}

/** The accessible name of a reaction button — no emoji-name dataset needed. */
export function reactionButtonLabel(reaction: string, mine: boolean): string {
  return mine ? `Remove your ${reaction}` : `React with ${reaction}`;
}
