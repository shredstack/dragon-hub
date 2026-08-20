/**
 * Whether a section's image sits above its body text or below it.
 *
 * Stored as a slug in a `text` column (`email_sections.image_position`,
 * `email_recurring_sections.image_position`) rather than a `pgEnum`, following
 * the category-set rule in CLAUDE.md: the slug is what's stored, the label is
 * display only, and a value the app no longer recognizes falls back to the
 * layout every section had before the choice existed instead of rendering
 * nothing.
 *
 * Client-safe — the section editor and the compile path narrow identically.
 */

export const EMAIL_IMAGE_POSITIONS = {
  above: "Image above text",
  below: "Image below text",
} as const;

export type EmailImagePosition = keyof typeof EMAIL_IMAGE_POSITIONS;

export const DEFAULT_EMAIL_IMAGE_POSITION: EmailImagePosition = "below";

/** Narrows an unknown stored value; anything unrecognized reads as "below". */
export function parseImagePosition(value: unknown): EmailImagePosition {
  return value === "above" ? "above" : DEFAULT_EMAIL_IMAGE_POSITION;
}
