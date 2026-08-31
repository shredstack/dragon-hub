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
  parseRelayAddresses,
  recipientList,
  type MailingGroupView,
  type MailingRelay,
} from "@/lib/mail-merge-shared";

export interface RenderedGroup {
  subject: string;
  /** The body as HTML, ready for the clipboard's `text/html` flavour. */
  html: string;
  /** The same body as plain text, for the fallback flavour and for `mailto:`. */
  text: string;
  /** Comma-separated addresses for the To field — the relay when there is one. */
  to: string;
  /**
   * The audience's own addresses, always. Equal to `to` for an ordinary
   * mailing; for a relayed one this is who the office has to reach, which is
   * the thing they cannot work out for themselves.
   */
  audienceTo: string;
  /** How many people the email is meant to reach. Never the relay's count. */
  recipientCount: number;
  /** Whether `to` is a relay rather than the audience. */
  viaRelay: boolean;
}

/**
 * `{{note}}` is merged here rather than baked into the group's stored variables
 * so that editing a note updates the preview immediately, without a rebuild.
 * `{{relay_name}}` and the two `audience_*` fields are the same — the relay is a
 * mailing-level setting a board member edits while looking at the preview, and
 * the audience addresses are derived from `recipients` rather than stored, so
 * neither needs a rebuild to come out right.
 */
export function renderGroup(params: {
  subjectTemplate: string;
  bodyTemplate: string;
  group: Pick<MailingGroupView, "variables" | "note" | "recipients">;
  relay?: MailingRelay | null;
}): RenderedGroup {
  const audience = dedupeRecipients(params.group.recipients);
  const audienceTo = recipientList(params.group.recipients);
  const relayTo = parseRelayAddresses(params.relay?.to).join(", ");

  const variables = {
    ...params.group.variables,
    note: params.group.note ?? "",
    relay_name: params.relay?.name?.trim() ?? "",
    audience_emails: audienceTo,
    audience_count: String(audience.length),
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
    to: relayTo || audienceTo,
    audienceTo,
    // Counted after deduping, so it can never disagree with the audience line it
    // sits next to. Someone who is both a teacher and a room parent is one
    // email. A relay is a courier and is deliberately not counted here.
    recipientCount: audience.length,
    viaRelay: relayTo.length > 0,
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
