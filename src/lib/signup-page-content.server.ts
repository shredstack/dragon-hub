import "server-only";

import { sanitizeRichTextHtml, stripHtml } from "@/lib/rich-text";
import {
  applySignupPageTokens,
  withSignupPageDefaults,
  type SignupPageContent,
} from "@/lib/signup-page-content";

/**
 * Clean board-authored input on the way into the database.
 *
 * Headings and taglines render as plain text, so markup in them is stripped
 * outright rather than escaped — it would only ever be a paste artifact.
 */
export function sanitizeSignupPageContent(
  input: Partial<SignupPageContent>
): SignupPageContent {
  const content = withSignupPageDefaults(input);
  return {
    headline: stripHtml(content.headline),
    tagline: stripHtml(content.tagline),
    welcomeHeading: stripHtml(content.welcomeHeading),
    introHtml: sanitizeRichTextHtml(content.introHtml),
    rolesHtml: sanitizeRichTextHtml(content.rolesHtml),
    showRolesPanel: content.showRolesPanel,
  };
}

/**
 * Content ready to render on the public page: defaults filled, HTML sanitized,
 * `{{school}}` resolved.
 *
 * Sanitizing here as well as on save is deliberate — it covers rows written
 * before this feature existed and anything that reached the JSON column by
 * another path, and the output goes straight into dangerouslySetInnerHTML.
 */
export function resolveSignupPageContent(
  stored: Partial<SignupPageContent> | null | undefined,
  schoolName: string
): SignupPageContent {
  return applySignupPageTokens(
    sanitizeSignupPageContent(withSignupPageDefaults(stored)),
    schoolName
  );
}
