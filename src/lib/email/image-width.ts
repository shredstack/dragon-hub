/**
 * How wide an image renders inside the email.
 *
 * **This is a property of the use, not of the file.** The same banner in the
 * media library is a full-width hero on the back-to-school email and a small
 * logo beside a two-line reminder the week after, so the width lives on
 * `email_sections` / `email_campaigns.header_*` / `email_recurring_sections`
 * next to the image URL — never on `media_library`. Nothing is re-encoded and
 * nothing is uploaded twice; one blob, sized per placement.
 *
 * The sizes are a fixed slate rather than a free pixel value because email is
 * not a browser. Outlook ignores CSS widths on `<img>` and lays out from the
 * `width` attribute, so the number has to be a real pixel count against the
 * 558px content column — and a secretary picking "Medium" is making a better
 * decision than one typing "347".
 *
 * Stored as a slug in a `text` column, per the category-set rule in CLAUDE.md:
 * the slug is stored, the label is display only, and an unrecognized value
 * falls back to the width the surface had before the choice existed rather
 * than rendering an image at zero.
 *
 * Client-safe — the editors, the live preview and the compile path all narrow
 * identically, so what the secretary sees is what the school receives.
 */

/**
 * The usable width of the email's content column: the 598px table less its
 * 20px of padding on each side. `full` means exactly this, which is why an
 * image set to it can be edge-to-edge without overflowing.
 */
export const EMAIL_CONTENT_WIDTH_PX = 558;

export const EMAIL_IMAGE_WIDTHS = {
  small: { label: "Small", px: 200 },
  medium: { label: "Medium", px: 350 },
  large: { label: "Large", px: 500 },
  full: { label: "Full width", px: EMAIL_CONTENT_WIDTH_PX },
} as const;

export type EmailImageWidth = keyof typeof EMAIL_IMAGE_WIDTHS;

/**
 * `large` is 500px — the width every section image was hard-coded to before
 * this control existed, so every row written before it reads back unchanged.
 */
export const DEFAULT_EMAIL_IMAGE_WIDTH: EmailImageWidth = "large";

/** Likewise 558px for the header banner, which was hard-coded full-bleed. */
export const DEFAULT_EMAIL_HEADER_IMAGE_WIDTH: EmailImageWidth = "full";

/** The slate in render order, for a picker. */
export const EMAIL_IMAGE_WIDTH_OPTIONS = (
  Object.keys(EMAIL_IMAGE_WIDTHS) as EmailImageWidth[]
).map((value) => ({ value, ...EMAIL_IMAGE_WIDTHS[value] }));

/**
 * Narrows an unknown stored value. Takes its fallback explicitly because the
 * two surfaces disagree about what "unset" meant historically — a section was
 * 500px and a header banner was 558px.
 */
export function parseImageWidth(
  value: unknown,
  fallback: EmailImageWidth = DEFAULT_EMAIL_IMAGE_WIDTH
): EmailImageWidth {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(EMAIL_IMAGE_WIDTHS, value)
    ? (value as EmailImageWidth)
    : fallback;
}

/** The pixel count that goes in the `width` attribute. */
export function emailImageWidthPx(
  value: unknown,
  fallback: EmailImageWidth = DEFAULT_EMAIL_IMAGE_WIDTH
): number {
  return EMAIL_IMAGE_WIDTHS[parseImageWidth(value, fallback)].px;
}

/** "Medium — 350px wide", for a picker's hint line. */
export function emailImageWidthLabel(
  value: unknown,
  fallback: EmailImageWidth = DEFAULT_EMAIL_IMAGE_WIDTH
): string {
  const width = EMAIL_IMAGE_WIDTHS[parseImageWidth(value, fallback)];
  return `${width.label} — ${width.px}px wide`;
}
