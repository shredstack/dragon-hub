/**
 * Client-safe board position types and the standard PTA slate.
 *
 * Nothing here touches the database, so client components can import it. The
 * live, school-specific positions come from `src/lib/board-positions.ts`
 * (server) — this module only supplies the seed slate and the formatting
 * fallbacks used when a slug has no row (a position deleted out from under
 * historical data, or a regional resource naming a slug this school renamed).
 */

/** Stable identifier stored on every table that names a position. */
export type BoardPositionSlug = string;

export type BoardPosition = {
  id: string;
  slug: BoardPositionSlug;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  isStandard: boolean;
};

/** slug → label, for rendering a stored slug without another query. */
export type BoardPositionLabels = Record<BoardPositionSlug, string>;

/**
 * The slate every new school starts with, and the backfill for schools that
 * predate the board_positions table. These slugs are also what super admins
 * file state/district onboarding resources against, so they are effectively
 * platform vocabulary — rename the label, never the slug.
 */
export const STANDARD_BOARD_POSITIONS: ReadonlyArray<{
  slug: string;
  label: string;
  description: string;
}> = [
  {
    slug: "president",
    label: "President",
    description:
      "Leads the PTA, runs board and general meetings, and is the main point of contact with school administration.",
  },
  {
    slug: "vice_president",
    label: "Vice President",
    description:
      "Supports the President, steps in when they are unavailable, and often oversees committees and events.",
  },
  {
    slug: "president_elect",
    label: "President Elect",
    description:
      "Shadows the President in preparation for taking over the role next year.",
  },
  {
    slug: "vp_elect",
    label: "VP Elect",
    description:
      "Shadows the Vice President in preparation for taking over the role next year.",
  },
  {
    slug: "treasurer",
    label: "Treasurer",
    description:
      "Owns the budget, records income and expenses, handles reimbursements, and reports finances to the board.",
  },
  {
    slug: "secretary",
    label: "Secretary",
    description:
      "Takes minutes at meetings, maintains records and the document archive, and handles official correspondence.",
  },
  {
    slug: "legislative_vp",
    label: "Legislative VP",
    description:
      "Tracks education legislation and advocacy efforts, and keeps the board informed on policy that affects the school.",
  },
  {
    slug: "public_relations_vp",
    label: "Public Relations VP",
    description:
      "Handles communications: newsletters, social media, flyers, and publicity for PTA events.",
  },
  {
    slug: "membership_vp",
    label: "Membership VP",
    description:
      "Runs the membership drive, tracks enrollment, and welcomes new PTA members.",
  },
  {
    slug: "room_parent_vp",
    label: "Room Parent VP",
    description:
      "Recruits and assigns a room parent for every classroom, and supports them through the year.",
  },
];

/** Slugs of the standard slate, for quick membership checks. */
export const STANDARD_BOARD_POSITION_SLUGS: ReadonlySet<string> = new Set(
  STANDARD_BOARD_POSITIONS.map((p) => p.slug)
);

/**
 * Turn an arbitrary label into a slug. Used when a school adds its own
 * position; collisions are resolved by the action that inserts the row.
 */
export function slugifyPositionLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Best-effort label for a slug with no row behind it — historical data filed
 * under a position that was later deleted, or a regional resource naming a slug
 * this school never had. Renders "teacher_rep" as "Teacher Rep" rather than
 * leaking a raw slug into the UI.
 */
export function fallbackPositionLabel(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const STANDARD_LABELS_BY_SLUG: Record<string, string> = Object.fromEntries(
  STANDARD_BOARD_POSITIONS.map((p) => [p.slug, p.label])
);

/**
 * Label for a slug with no school in scope — embedding text, search result
 * formatting, super admin screens. Uses the standard label when the slug is a
 * standard one, otherwise formats the slug. A school that renamed the position
 * will see its own name wherever a school-scoped lookup is available; this is
 * the floor, not the preferred path.
 */
export function standardOrFallbackLabel(slug: string): string {
  return STANDARD_LABELS_BY_SLUG[slug] ?? fallbackPositionLabel(slug);
}

/** Resolve a slug to its school-specific label, falling back gracefully. */
export function positionLabel(
  labels: BoardPositionLabels | undefined,
  slug: string | null | undefined
): string | undefined {
  if (!slug) return undefined;
  return labels?.[slug] ?? fallbackPositionLabel(slug);
}
