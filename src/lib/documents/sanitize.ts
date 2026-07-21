// Tags that can execute or load remote content. Mammoth never emits these —
// it builds elements from the docx structure rather than passing HTML through
// — but the output still ends up in dangerouslySetInnerHTML, so a malformed
// or hand-crafted .docx must not be the one thing standing between a viewer
// and script execution.
const DANGEROUS_TAGS =
  /<\s*(script|style|iframe|object|embed|link|meta|form|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(script|style|iframe|object|embed|link|meta|form|base)\b[^>]*\/?>/gi;

const EVENT_HANDLER_ATTRS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

// Anything that isn't a plain link or an inline image mammoth encoded itself.
const UNSAFE_URL_ATTR =
  /\s(href|src)\s*=\s*("|')\s*(javascript|vbscript|data)\s*:(?!image\/)[^"']*\2/gi;

/**
 * Strip the parts of converted document HTML that could run code.
 *
 * Deliberately a filter rather than an allowlist parser: mammoth's output is a
 * small, known set of structural tags, so the goal is to remove the handful of
 * constructs that could ever be dangerous, not to re-validate the document.
 */
export function sanitizeDocumentHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, "")
    .replace(EVENT_HANDLER_ATTRS, "")
    .replace(UNSAFE_URL_ATTR, "");
}
