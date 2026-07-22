/**
 * The mission copy, in one place.
 *
 * These strings show up on the marketing page, on the two public volunteer
 * flows, and on the board onboarding hub. Keeping them here means the wording
 * stays identical everywhere — a mission that's phrased three slightly
 * different ways reads as marketing, not as something the org believes.
 *
 * Dependency-free so server components, client components, and the email
 * builder can all pull from it.
 *
 * The quoted mission is National PTA's, adopted verbatim by state PTAs
 * (including Utah), so it's correct for every school on the platform.
 */

/** National PTA's mission, quoted verbatim. Attribute it wherever it's shown. */
export const PTA_MISSION =
  "to make every child's potential a reality by engaging and empowering families and communities to advocate for all children";

export const PTA_MISSION_ATTRIBUTION = "National PTA";

/** Short form — headers, heroes, footers. Keep it under one line. */
export const MISSION_TAGLINE =
  "Turning potential into reality — by making it easy for every family to show up.";

/**
 * The full statement. Two sentences: what we're for, then how we get there.
 * Used on the landing page and anywhere the tagline needs backing up.
 */
export const MISSION_STATEMENT =
  "DragonHub exists to make every child's potential a reality by removing the friction between a family's willingness to help and their ability to. We give PTAs one place where institutional knowledge is preserved instead of lost, where volunteering takes a scan and a minute instead of an email chain, and where every incoming board member inherits everything their predecessor knew.";

/**
 * Shown to a parent at the moment they're deciding whether to say yes. Speaks
 * to what their "yes" is worth rather than to what the software does.
 */
export const MISSION_VOLUNTEER_NOTE =
  "Every hour a parent gives is an hour a child gets. Thank you for showing up.";

/**
 * Shown to a board member on the onboarding hub — the moment they're most
 * likely to feel in over their head.
 */
export const MISSION_BOARD_NOTE =
  "You don't have to figure this out alone. Everything your predecessors learned is here, so you can spend your year on the kids instead of on catching up.";
