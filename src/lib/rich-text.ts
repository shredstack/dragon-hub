import sanitizeHtml from "sanitize-html";

/**
 * The tags SimpleRichTextEditor can produce (contentEditable + execCommand),
 * plus the block elements a board member might paste in from a doc. Anything
 * else is dropped — this HTML is authored in the admin UI but rendered on a
 * public, unauthenticated page, so it goes through an allowlist on the way out.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "hr",
  "span",
  "div",
];

/**
 * Strip everything from board-authored HTML that could run code.
 *
 * Applied on save AND on render: saving covers new content, rendering covers
 * rows written before this existed and anything that reached the column by
 * another path.
 */
export function sanitizeRichTextHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
    },
    // The highlight/colour classes globals.css defines for the rich editors.
    allowedClasses: {
      span: ["highlight", "text-color-red", "text-color-blue", "text-color-green"],
      div: ["highlight"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    // Contents of a disallowed tag are kept by default, which would leave a
    // script body sitting on the page as visible text.
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
}

/**
 * sanitize-html re-serializes text nodes as HTML, escaping `&`, `<`, `>` and `"`.
 * That is exactly wrong for fields that render as React text, where `&amp;`
 * shows up on the page as the literal five characters. Undo that closed set —
 * `&amp;` last, so `&amp;lt;` decodes to `&lt;` and not to `<`.
 */
function decodeEscapedText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Strip all markup — for fields that render as plain text (headings, taglines).
 *
 * Returns real text, not HTML: the caller is expected to render it as a JSX
 * child, which does its own escaping. Never feed this to innerHTML.
 */
export function stripHtml(value: string): string {
  return decodeEscapedText(
    sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
  ).trim();
}
