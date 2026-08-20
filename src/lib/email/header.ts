/**
 * The block above the first section of a weekly email — greeting, a line of
 * welcome, optionally a banner image.
 *
 * This used to be two hard-coded sentences in `compileEmailHtml`, which meant
 * the one part of the email that speaks in the school's own voice was the one
 * part nobody could edit. Now it is stored per campaign (`email_campaigns
 * .header_html` / `.header_image_url`), seeded at creation from the school
 * default in `schools.email_settings`.
 *
 * **Snapshot, not read-through.** A campaign copies the school default when it
 * is created and never consults it again. Rewording the default for next term
 * must not rewrite the header on an email that already went out.
 *
 * Client-safe: no db, no server-only imports, so the live preview in the
 * browser and the compile on the server produce byte-identical HTML.
 */

import type { EmailAudience } from "@/types";

/**
 * Variables a header may use. `{{greeting}}` is the one that earns its keep:
 * the same header is compiled twice, once for PTA members and once for the
 * whole school, and the salutation is the only part that differs.
 */
export const EMAIL_HEADER_VARIABLES = [
  {
    token: "{{greeting}}",
    label: "Greeting",
    hint: 'Becomes "Hi <School> PTA Members," or "Hi <School> Families," depending on which version is being sent.',
  },
  {
    token: "{{school_name}}",
    label: "School name",
    hint: "The school's name.",
  },
] as const;

/**
 * What a school gets before it writes its own — the wording that was baked
 * into the template before headers were editable, so nothing changes for a
 * school that never touches this.
 */
export const DEFAULT_EMAIL_HEADER_HTML =
  "<p>{{greeting}}</p><p>Here are some upcoming events and news to share:</p>";

export interface EmailHeader {
  headerHtml: string | null;
  headerImageUrl: string | null;
  headerImageAlt: string | null;
}

/** "Hi Dragon Elementary Families," — the salutation for one audience. */
export function emailGreeting(
  schoolName: string,
  audience: EmailAudience
): string {
  return audience === "pta_only"
    ? `Hi ${schoolName} PTA Members,`
    : `Hi ${schoolName} Families,`;
}

/**
 * Substitutes the header's variables. Unknown `{{tokens}}` are left standing
 * rather than blanked, for the same reason mail merge leaves them: a visible
 * `{{greetng}}` gets fixed before sending, an empty gap in a sentence gets
 * sent.
 */
export function renderEmailHeaderText(
  html: string,
  schoolName: string,
  audience: EmailAudience
): string {
  return html
    .replace(/\{\{greeting\}\}/g, emailGreeting(schoolName, audience))
    .replace(/\{\{school_name\}\}/g, schoolName);
}

/**
 * The header as email-client-safe HTML table rows, or `""` when the header is
 * blank in every respect — a school that wants its email to open straight on
 * the first section should get exactly that, with no empty padding row.
 */
export function renderEmailHeaderHtml(params: {
  header: EmailHeader;
  schoolName: string;
  audience: EmailAudience;
}): string {
  const { header, schoolName, audience } = params;

  // `null` means "never customized", which is the default wording. An explicit
  // empty string means the secretary deleted the header on purpose.
  const rawHtml = header.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML;
  const text = rawHtml.trim()
    ? renderEmailHeaderText(rawHtml, schoolName, audience)
    : "";
  const imageUrl = header.headerImageUrl?.trim() || "";

  if (!text && !imageUrl) return "";

  const imageRow = imageUrl
    ? `
          <tr>
            <td style="padding: 24px 20px 0 20px; text-align: center;">
              <img src="${imageUrl}" alt="${
                header.headerImageAlt || schoolName
              }" width="558" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px;" />
            </td>
          </tr>`
    : "";

  const textRow = text
    ? `
          <tr>
            <td style="padding: ${
              imageUrl ? "20px" : "30px"
            } 20px 10px 20px; font-size: 16px; line-height: 1.6; color: #1f2937;">
              ${styleHeaderParagraphs(text)}
            </td>
          </tr>`
    : "";

  return `${imageRow}${textRow}
          <tr>
            <td style="padding: 0 20px;">
              <hr style="border: none; border-top: 2px solid #e5e7eb; margin: 20px 0;" />
            </td>
          </tr>`;
}

/** The plain-text counterpart, for `compileEmailPlainText`. */
export function renderEmailHeaderPlainText(params: {
  header: EmailHeader;
  schoolName: string;
  audience: EmailAudience;
}): string {
  const rawHtml = params.header.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML;
  if (!rawHtml.trim()) return "";
  return renderEmailHeaderText(rawHtml, params.schoolName, params.audience)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Inline styling for the paragraphs the rich text editor produces. */
function styleHeaderParagraphs(html: string): string {
  return html
    .replace(/<p>/g, '<p style="margin: 0 0 15px 0;">')
    .replace(/<a /g, '<a style="color: #2563eb; text-decoration: underline;" ')
    .replace(/<strong>/g, '<strong style="font-weight: 600;">');
}
