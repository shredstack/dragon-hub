/**
 * Rendering one group's email from the template.
 *
 * Client-safe and deliberately tiny: the preview in the editor, the send panel
 * and the clipboard all render through this one function, so what a board
 * member proofreads is byte-for-byte what they paste. A preview that renders
 * differently from the thing sent is worse than no preview.
 */

import {
  dedupeRecipients,
  mergeTemplate,
  mergeTemplateHtml,
  recipientList,
  type MailingGroupView,
} from "@/lib/mail-merge-shared";

export interface RenderedGroup {
  subject: string;
  /** The body as HTML, ready for the clipboard's `text/html` flavour. */
  html: string;
  /** The same body as plain text, for the fallback flavour and for `mailto:`. */
  text: string;
  /** Comma-separated addresses for the To field. */
  to: string;
  recipientCount: number;
}

/**
 * `{{note}}` is merged here rather than baked into the group's stored variables
 * so that editing a note updates the preview immediately, without a rebuild.
 */
export function renderGroup(params: {
  subjectTemplate: string;
  bodyTemplate: string;
  group: Pick<MailingGroupView, "variables" | "note" | "recipients">;
}): RenderedGroup {
  const variables = {
    ...params.group.variables,
    note: params.group.note ?? "",
  };
  // The body is HTML, so its values are escaped on the way in — several of them
  // are names typed into the public signup form. The subject is plain text
  // (React renders it, Gmail takes it as a URL param) and must not be escaped,
  // or an ampersand in a school's name arrives as `&amp;`.
  const html = mergeTemplateHtml(params.bodyTemplate, variables);
  return {
    subject: mergeTemplate(params.subjectTemplate, variables),
    html,
    text: htmlToPlainText(html),
    to: recipientList(params.group.recipients),
    // Counted after deduping, so it can never disagree with the To line it sits
    // next to. Someone who is both a teacher and a room parent is one email.
    recipientCount: dedupeRecipients(params.group.recipients).length,
  };
}

/**
 * A readable plain-text version of the editor's HTML.
 *
 * Not a general HTML-to-text converter — it only has to handle what
 * `SimpleRichTextEditor` produces (paragraphs, headings, lists, links, bold).
 * Links become "text (url)" because the plain-text flavour is what lands if
 * someone pastes into a client that refuses rich text, and a signup link that
 * vanished in that case would be the one thing the email existed to deliver.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(
      /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, "").trim();
        return text && text !== href ? `${text} (${href})` : href;
      }
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
