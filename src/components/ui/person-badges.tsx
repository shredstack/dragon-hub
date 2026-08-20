import { Badge } from "@/components/ui/badge";
import {
  personBadgeLabel,
  type PersonBadge,
} from "@/lib/school-person-badges-shared";

/**
 * "🍎 Teacher", "🏫 School staff", "PTA board" — who this person is, beside
 * their name on a board-side roster.
 *
 * Rendered through `WaitlistPerson.badges`, which is already a `ReactNode` slot
 * for exactly this kind of chip (it carries `WouldChairBadge` today), so the
 * help-request queue, the interest roster and the plan roster all show them
 * identically without any of them growing their own.
 *
 * Client-safe and stateless — the map comes from `getPersonBadges()` on the
 * server, which is also where the "board and lead surfaces only" rule is
 * enforced. Renders nothing for a plain parent, which is the common case.
 */
export function PersonBadges({ badges }: { badges: PersonBadge[] | undefined }) {
  if (!badges || badges.length === 0) return null;

  return (
    <>
      {badges.map((badge) => (
        <Badge key={badge} variant="secondary">
          {personBadgeLabel(badge)}
        </Badge>
      ))}
    </>
  );
}
