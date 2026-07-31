/**
 * How an image embedded in a scavenger hunt item is displayed.
 *
 * The problem this solves: a hunt board is a vertical list of cards read on a
 * phone in a loud gym. Board members will paste whatever they have — a portrait
 * screenshot of a budget page, a wide spreadsheet crop, a square flyer — and
 * rendering each at its natural height makes the board lurch: one card is a
 * 20px strip of illegible text, the next is three screens tall and pushes the
 * check-off button out of reach.
 *
 * So an image never sizes the card. Every image is rendered into the *same*
 * fixed box (`HUNT_IMAGE_ASPECT_CLASS`), and the only per-item choice is what
 * happens inside that box:
 *
 * - `contain` — letterboxed on a muted backdrop. Nothing is cropped, so it is
 *   the only honest choice for a document. The default, because a cropped
 *   budget is a wrong budget.
 * - `cover` — fills the box, cropping the edges. Right for a photo, where the
 *   letterbox bars would look like a mistake.
 *
 * Neither is expected to be *readable* at card size — a budget page never will
 * be on a 400px-wide screen. The fixed box is a legible-enough preview plus a
 * promise: tapping it opens the full image full-screen, in the app, without
 * losing the hunt. That's the difference from an attachment link, which costs
 * the player the page they're standing in.
 *
 * Dependency-free and client-safe: the admin form, the public board and the
 * server action all import from here.
 */

export type HuntImageFit = "contain" | "cover";

export const HUNT_IMAGE_FITS: readonly HuntImageFit[] = ["contain", "cover"];

/**
 * The one shape every hunt image is rendered into. 4:3 is the compromise: tall
 * enough that a portrait document is recognizable, short enough that a card
 * with an image still leaves its check-off button on screen.
 */
export const HUNT_IMAGE_ASPECT_CLASS = "aspect-[4/3]";

/**
 * Whatever came out of a form or an old row, narrowed to a fit we can render.
 * Anything unrecognized falls back to `contain` — showing the whole image is
 * never wrong, only sometimes small.
 */
export function parseHuntImageFit(value: unknown): HuntImageFit {
  return value === "cover" ? "cover" : "contain";
}

/**
 * The fit to pre-select for a freshly chosen image, from its own proportions.
 *
 * An image already close to the display box loses nothing to a crop and looks
 * better filling it, so photos default to `cover`. Anything markedly taller or
 * wider than the box is almost always a document — a budget page, a spreadsheet
 * crop — where a crop would eat the numbers, so those default to `contain`.
 *
 * A default, not a lock: the form shows both and the board member picks.
 */
export function defaultHuntImageFit(
  width: number,
  height: number
): HuntImageFit {
  if (!width || !height) return "contain";
  const ratio = width / height;
  return ratio >= 0.9 && ratio <= 2 ? "cover" : "contain";
}

/** Alt text for an item image, falling back to something better than "". */
export function huntImageAlt(
  alt: string | null | undefined,
  itemTitle: string
): string {
  return alt?.trim() || itemTitle;
}
