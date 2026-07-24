/**
 * Client-safe school admin position types and the standard slate.
 *
 * The exact counterpart of `board-positions-shared.ts`, for the school's side
 * of the house rather than the PTA's. Nothing here touches the database, so
 * client components can import it; the live, school-specific rows come from
 * `src/lib/school-admin-positions.ts` (server).
 *
 * These slugs live in their own namespace from the board slate on purpose.
 * Both slates want a "Secretary" and they are not the same job, so the two are
 * stored in different columns (`school_memberships.admin_position` vs
 * `board_position`) and resolved by different tables.
 */

export type SchoolAdminPositionSlug = string;

export type SchoolAdminPosition = {
  id: string;
  slug: SchoolAdminPositionSlug;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  isStandard: boolean;
};

/** slug → label, for rendering a stored slug without another query. */
export type SchoolAdminPositionLabels = Record<SchoolAdminPositionSlug, string>;

/**
 * The slate every school starts with. Unlike the board slate these are not
 * platform vocabulary — nothing files resources against them — so a school is
 * free to rename or retire any of them. They exist so the picker is never
 * empty on first use.
 */
export const STANDARD_SCHOOL_ADMIN_POSITIONS: ReadonlyArray<{
  slug: string;
  label: string;
  description: string;
}> = [
  {
    slug: "principal",
    label: "Principal",
    description:
      "Leads the school and is the PTA's main point of contact with school administration.",
  },
  {
    slug: "assistant_principal",
    label: "Assistant Principal",
    description:
      "Supports the Principal and often oversees day-to-day operations and scheduling.",
  },
  {
    slug: "office_secretary",
    label: "Office Secretary",
    description:
      "Runs the front office; usually the person who knows where everything actually is.",
  },
  {
    slug: "office_manager",
    label: "Office Manager",
    description:
      "Manages office staff, facilities requests, and school communications.",
  },
  {
    slug: "counselor",
    label: "Counselor",
    description:
      "School counselor, often involved in family outreach and student support programs.",
  },
  {
    slug: "teacher_liaison",
    label: "Teacher Liaison",
    description:
      "The faculty representative who carries information between teachers and the PTA.",
  },
];

export const STANDARD_SCHOOL_ADMIN_POSITION_SLUGS: ReadonlySet<string> = new Set(
  STANDARD_SCHOOL_ADMIN_POSITIONS.map((p) => p.slug)
);

/**
 * Turn an arbitrary label into a slug. Used when a school adds its own
 * position; collisions are resolved by the action that inserts the row.
 */
export function slugifyAdminPositionLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Best-effort label for a slug with no row behind it — a membership filed
 * under a position that was later retired and then hard-deleted. Renders
 * "assistant_principal" as "Assistant Principal" rather than leaking the slug.
 */
export function fallbackAdminPositionLabel(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Resolve a slug to its school-specific label, falling back gracefully. */
export function adminPositionLabel(
  labels: SchoolAdminPositionLabels | undefined,
  slug: string | null | undefined
): string | undefined {
  if (!slug) return undefined;
  return labels?.[slug] ?? fallbackAdminPositionLabel(slug);
}
