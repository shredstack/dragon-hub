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
  headline: "Dragon Hub",
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
