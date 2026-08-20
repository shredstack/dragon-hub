/**
 * The badge vocabulary, client-safe so the component and the query agree.
 *
 * Slugs are stored nowhere — these are computed per screen — but they still
 * travel from a server component to a client one, so the labels live beside the
 * slugs rather than in a map the component invents.
 */

export const PERSON_BADGES = {
  teacher: { label: "Teacher", emoji: "🍎" },
  staff: { label: "School staff", emoji: "🏫" },
  pta_board: { label: "PTA board", emoji: "" },
} as const;

export type PersonBadge = keyof typeof PERSON_BADGES;

export function personBadgeLabel(badge: PersonBadge): string {
  const spec = PERSON_BADGES[badge];
  return spec.emoji ? `${spec.emoji} ${spec.label}` : spec.label;
}
