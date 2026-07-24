/**
 * Client-safe helpers for the board's curated link list.
 *
 * The URL and open-mode rules used to live here; they now live in
 * `@/lib/links-shared` because hunt items and the volunteer eligibility
 * reminder need exactly the same ones. They're re-exported so this stays the
 * single import for the important-links surfaces, and so there is still only
 * one implementation of each.
 */

export {
  LINK_OPEN_MODES,
  defaultOpenModeFor,
  isLikelyEmbeddable,
  linkHostname,
  linkPreviewUrl,
  normalizeLinkUrl,
  parseLinkOpenMode,
  type LinkOpenMode,
} from "@/lib/links-shared";

import type { LinkOpenMode } from "@/lib/links-shared";

export interface ImportantLink {
  id: string;
  title: string;
  description: string | null;
  url: string;
  iconEmoji: string | null;
  openMode: LinkOpenMode;
  sortOrder: number;
  active: boolean;
}

/** A starter set, so a board member doesn't have to hunt for an emoji. */
export const SUGGESTED_LINK_EMOJI = [
  "🔗", "📝", "🎽", "🍎", "📅", "💳", "📚", "🎟️", "📸", "🏫",
  "🚌", "🧾", "🎨", "⚽", "🎵", "🤝", "📣", "❤️", "🐉", "⭐",
];
