/**
 * The rules for every board-entered outbound link in DragonHub.
 *
 * These started life inside the dashboard's "Important links" feature, but the
 * same two questions come up everywhere a board member can paste a URL — is
 * this safe to put in an `href`, and should it open in a new tab or in a window
 * over the app? Keeping one copy of the answers is the point: a second
 * `normalizeUrl` somewhere else is how a `javascript:` URL eventually reaches a
 * page every family clicks.
 *
 * Dependency-free and client-safe, so admin forms, public pages, and server
 * actions can all import it.
 *
 * Current callers: important links (`@/lib/important-links-shared`), scavenger
 * hunt items, the volunteer eligibility reminder
 * (`@/lib/volunteer-eligibility`).
 */

/**
 * `new_tab` always works. `in_app` frames the destination in a dialog over the
 * current page — see `@/components/ui/link-preview-dialog` for why that mode
 * can never be fully trusted, and always keeps an escape hatch.
 */
export type LinkOpenMode = "new_tab" | "in_app";

export const LINK_OPEN_MODES: readonly LinkOpenMode[] = ["new_tab", "in_app"];

/**
 * Whatever came out of a form, a JSON column, or an old row, narrowed to a mode
 * we can actually render. Anything unrecognized falls back to the mode that
 * always works rather than to a frame that may silently stay blank.
 */
export function parseLinkOpenMode(value: unknown): LinkOpenMode {
  return value === "in_app" ? "in_app" : "new_tab";
}

/**
 * What someone typed, turned into something safe to put in an `href`.
 *
 * Two jobs: forgive a parent-facing form (`school.org/store` is what people
 * paste) and refuse anything that isn't a web address — a `javascript:` URL in
 * a link families click would be a stored XSS.
 *
 * Returns null when there's nothing usable, so callers have to decide what an
 * unusable link means for their surface instead of rendering a broken one.
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

/** The bare domain, for the "where does this go" hint under a link. */
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
 * Used only to pick the *default* open mode when someone pastes a URL — they
 * can always override it. There's no way to ask a site this from the browser (a
 * refused frame is silent, cross-origin), so this is a whitelist of the handful
 * of hosts a PTA links to constantly, not a general test.
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

/**
 * The open mode to pre-select for a freshly pasted URL. Every link form should
 * call this on change rather than hard-coding `new_tab`, so the Google Doc case
 * — the one a board member is most likely to want framed — works by default.
 */
export function defaultOpenModeFor(rawUrl: string): LinkOpenMode {
  const normalized = normalizeLinkUrl(rawUrl);
  return normalized && isLikelyEmbeddable(normalized) ? "in_app" : "new_tab";
}
