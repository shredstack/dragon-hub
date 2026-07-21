import sanitizeHtml from "sanitize-html";

// Mammoth builds elements from the docx structure rather than passing HTML
// through, so this is the small set of tags it can ever emit. Anything else in
// the converted output came from somewhere unexpected and is dropped.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "hr",
  "span",
  "div",
];

// The raster types mammoth inlines. Deliberately no svg+xml: an SVG data URI
// carries its own markup, scripts and event handlers included.
const SAFE_INLINE_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,/i;

/**
 * Strip everything from converted document HTML that could run code.
 *
 * An allowlist parser rather than a set of regexes: the result goes into
 * dangerouslySetInnerHTML, and a document viewer whose whole point is reading
 * files a third party attached can't rely on enumerating dangerous patterns.
 * Tags, attributes, and URL schemes all have to be named here to survive.
 */
export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      "*": ["id"],
    },
    // No javascript:/vbscript:, and no data: except the raster images mammoth
    // inlines itself — data:image/svg+xml can carry scripts of its own.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    // Contents of a disallowed tag are kept by default, which would leave
    // script bodies as visible text.
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
    // Returning true drops the element. Only inline images are examined; the
    // allowlist above has already handled everything else.
    exclusiveFilter: (frame) => {
      if (frame.tag !== "img") return false;
      const src = frame.attribs.src ?? "";
      if (!src.startsWith("data:")) return false;
      return !SAFE_INLINE_IMAGE.test(src);
    },
  });
}
