/**
 * Client-safe helpers for the board's curated link list.
 *
 * Kept out of `@/actions/important-links` so the dashboard card and the admin
 * form — both client components — can share the URL rules without dragging the
 * database into the bundle.
 */

export type LinkOpenMode = "new_tab" | "in_app";

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

/**
 * What the board typed, turned into something safe to put in an `href`.
 *
 * Two jobs: forgive a parent-facing form (`school.org/store` is what someone
 * pastes) and refuse anything that isn't a web address — a `javascript:` URL
 * in a link every family clicks would be a stored XSS.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".")) return null;

  return parsed.toString();
}

/** The bare domain, for the "where does this go" hint under a card. */
export function linkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The URL to put in the preview iframe, when a link opens in the app.
 *
 * Most of what a PTA links to is a Google Doc, a Form, or a Drive file, and
 * each of those has an embeddable variant of the same URL — the `/edit` link a
 * board member copies out of their address bar will *not* frame. Anything we
 * don't recognize is framed as-is and may still be refused by the site, which
 * is what the dialog's "Open in new tab" escape hatch is for.
 */
export function linkPreviewUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const path = parsed.pathname;

  // Docs, Sheets, Slides, Drive files: swap the trailing verb for /preview.
  if (host === "docs.google.com" || host === "drive.google.com") {
    // Forms don't have a /preview — they have an embedded flag.
    if (path.includes("/forms/")) {
      const formUrl = new URL(parsed.toString());
      formUrl.pathname = path.replace(/\/(edit|viewform)$/, "/viewform");
      formUrl.searchParams.set("embedded", "true");
      return formUrl.toString();
    }
    const previewed = path.replace(/\/(edit|view|preview|pub)$/, "/preview");
    if (previewed !== path) {
      const previewUrl = new URL(parsed.toString());
      previewUrl.pathname = previewed;
      previewUrl.search = "";
      previewUrl.hash = "";
      return previewUrl.toString();
    }
    return parsed.toString();
  }

  if (host === "youtube.com" && path === "/watch") {
    const videoId = parsed.searchParams.get("v");
    if (videoId) return `https://www.youtube.com/embed/${videoId}`;
  }
  if (host === "youtu.be" && path.length > 1) {
    return `https://www.youtube.com/embed${path}`;
  }

  return parsed.toString();
}

/**
 * Whether we have positive reason to believe a site will let itself be framed.
 *
 * Used only to pick the *default* open mode when a board member pastes a URL —
 * they can always override it. There's no way to ask a site this from the
 * browser (a refused frame is silent, cross-origin), so this is a whitelist of
 * the handful of hosts a PTA links to constantly, not a general test.
 */
export function isLikelyEmbeddable(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return [
      "docs.google.com",
      "drive.google.com",
      "youtube.com",
      "youtu.be",
      "calendar.google.com",
    ].includes(host);
  } catch {
    return false;
  }
}
