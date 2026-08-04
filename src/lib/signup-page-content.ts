/**
 * The editable copy on the public volunteer sign-up page (/volunteer-signup/[code]).
 *
 * Stored on schools.volunteer_settings so the Room Parent VP can reword the page
 * without a deploy. Everything above the sign-up form itself is here; the form
 * (classroom picker, party checkboxes) stays code-driven because it's wired to
 * data, not copy.
 *
 * This module is deliberately dependency-free so the admin editor's live preview
 * can share it — the sanitizing half lives in signup-page-content.server.ts,
 * which pulls in sanitize-html and must stay out of client bundles.
 */
export interface SignupPageContent {
  /** Big heading at the top of the page. Plain text. */
  headline: string;
  /** Line under the headline. Plain text. */
  tagline: string;
  /** Heading inside the card. Plain text. */
  welcomeHeading: string;
  /** Short intro under the card heading. Rich text. */
  introHtml: string;
  /** The shaded panel explaining the roles. Rich text. */
  rolesHtml: string;
  /** Hide the shaded panel entirely without losing its content. */
  showRolesPanel: boolean;
}

export const DEFAULT_SIGNUP_PAGE_CONTENT: SignupPageContent = {
  headline: "DragonHub",
  tagline: "{{school}} Volunteer Sign-up",
  welcomeHeading: "Welcome to {{school}} Volunteer Sign-up!",
  introHtml:
    "<p>Sign up to be a Room Parent or Party Volunteer for your child's classroom.</p>",
  rolesHtml: [
    "<h3>Room Parent</h3>",
    "<p>Room parents help coordinate 2-3 class parties throughout the year ",
    "(Halloween, Valentine's Day, end-of-year). You'll work with the teacher and ",
    "other room parent to organize activities, communicate with parent volunteers, ",
    "and help make parties run smoothly. Time commitment: ~2-3 hours per party for ",
    "planning + party attendance.</p>",
    "<h3>Party Volunteer</h3>",
    "<p>Party volunteers help with setup, activities, and cleanup during classroom ",
    "parties. The room parents will reach out when they need extra hands! Time ",
    "commitment: ~1 hour during the party.</p>",
  ].join(""),
  showRolesPanel: true,
};

/**
 * Placeholders a board member can type instead of hard-coding the school name,
 * so the default copy still reads correctly for every school.
 */
export const SIGNUP_PAGE_TOKENS = [
  { token: "{{school}}", label: "School name" },
] as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyTokens(value: string, tokens: { school: string }): string {
  return value.replace(/\{\{\s*school\s*\}\}/gi, tokens.school);
}

/**
 * Fill in anything the stored content is missing. Schools configured before this
 * feature existed have no `signupPage` at all, and a partial object can survive a
 * shape change, so every field falls back individually rather than all-or-nothing.
 */
export function withSignupPageDefaults(
  stored: Partial<SignupPageContent> | null | undefined
): SignupPageContent {
  return {
    headline: stored?.headline ?? DEFAULT_SIGNUP_PAGE_CONTENT.headline,
    tagline: stored?.tagline ?? DEFAULT_SIGNUP_PAGE_CONTENT.tagline,
    welcomeHeading:
      stored?.welcomeHeading ?? DEFAULT_SIGNUP_PAGE_CONTENT.welcomeHeading,
    introHtml: stored?.introHtml ?? DEFAULT_SIGNUP_PAGE_CONTENT.introHtml,
    rolesHtml: stored?.rolesHtml ?? DEFAULT_SIGNUP_PAGE_CONTENT.rolesHtml,
    showRolesPanel:
      stored?.showRolesPanel ?? DEFAULT_SIGNUP_PAGE_CONTENT.showRolesPanel,
  };
}

/** One heading from board-authored copy, plus everything written under it. */
export interface HtmlSection {
  /** Index-based key. The copy has no stable ids — it's a single HTML blob. */
  key: string;
  /**
   * The heading's inner HTML. Already sanitized; keeps bold/italics, but
   * anchors are unwrapped — the heading renders inside the disclosure
   * `<button>`, where a nested `<a>` is invalid and a click would navigate
   * and toggle at once.
   */
  headingHtml: string;
  /** Everything between this heading and the next one. May be empty. */
  bodyHtml: string;
}

export interface SplitHtml {
  /** Anything before the first heading. Always shown — it's the lede. */
  leadHtml: string;
  sections: HtmlSection[];
}

/**
 * Split board-authored HTML at its headings so each one can be a disclosure.
 *
 * Role write-ups run long — a parent scanning the sign-up page on a phone at
 * Back-to-School Night should see the role *names* and choose what to read,
 * not scroll past six paragraphs to reach the form. Headings are the author's
 * own outline, so they're the natural fold.
 *
 * String surgery rather than DOM parsing: this runs on the server (public page)
 * and in the browser (admin preview), and the input is sanitize-html output, so
 * the tags are well-formed and the allowlist is closed (see rich-text.ts).
 * `<h2>`/`<h3>`/`<h4>` are the only heading tags that survive sanitizing.
 */
// Keep the linked text, drop the link. Quoted-attribute aware so an href
// containing ">" can't truncate the match.
function unwrapAnchors(html: string): string {
  return html.replace(/<a\b(?:[^>"']|"[^"]*"|'[^']*')*>|<\/a\s*>/gi, "");
}

export function splitHtmlByHeadings(html: string): SplitHtml {
  const headingPattern = /<(h[2-4])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const sections: HtmlSection[] = [];
  let leadEnd = html.length;
  let pending: { headingHtml: string; bodyStart: number } | null = null;

  for (const match of html.matchAll(headingPattern)) {
    const start = match.index ?? 0;
    if (pending) {
      sections.push({
        key: `s${sections.length}`,
        headingHtml: pending.headingHtml,
        bodyHtml: html.slice(pending.bodyStart, start).trim(),
      });
    } else {
      leadEnd = start;
    }
    pending = {
      headingHtml: unwrapAnchors(match[2]),
      bodyStart: start + match[0].length,
    };
  }

  if (pending) {
    sections.push({
      key: `s${sections.length}`,
      headingHtml: pending.headingHtml,
      bodyHtml: html.slice(pending.bodyStart).trim(),
    });
  }

  return { leadHtml: html.slice(0, leadEnd).trim(), sections };
}

/**
 * Swap `{{school}}` for the real name. HTML fields get the escaped form so a
 * school name containing `&` or `<` can't break (or inject into) the markup.
 */
export function applySignupPageTokens(
  content: SignupPageContent,
  schoolName: string
): SignupPageContent {
  const plain = { school: schoolName };
  const html = { school: escapeHtml(schoolName) };

  return {
    headline: applyTokens(content.headline, plain),
    tagline: applyTokens(content.tagline, plain),
    welcomeHeading: applyTokens(content.welcomeHeading, plain),
    introHtml: applyTokens(content.introHtml, html),
    rolesHtml: applyTokens(content.rolesHtml, html),
    showRolesPanel: content.showRolesPanel,
  };
}
