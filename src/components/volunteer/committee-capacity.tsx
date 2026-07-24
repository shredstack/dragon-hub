import type { PublicCommittee } from "@/actions/committees";
import {
  capacitySentence,
  isAtCapacity,
  type CapacityState,
} from "@/lib/waitlist-shared";

/**
 * A committee's capacity in the shape every waitlist surface takes, so the
 * shared copy helpers can render it alongside a classroom's room parent spots.
 * An `open` committee has no wall — `minSize` is a recruiting goal, not a gate.
 */
export function committeeCapacityState(committee: PublicCommittee): CapacityState {
  return {
    taken: committee.memberCount,
    limit: committee.capacityMode === "capped" ? committee.maxSize : null,
    waitlistEnabled: committee.waitlistEnabled,
  };
}

/**
 * The one-line "how full is this?" copy, shared by the standalone join page and
 * the room parent add-on so a parent reads the same sentence either way.
 *
 * Every branch here maps to a configuration the board chose deliberately — an
 * open committee never mentions a cap, and a capped one never says "everyone's
 * welcome". The capped wording itself comes from `capacitySentence`, which room
 * parent spots use too.
 */
export function committeeCapacityLine(committee: PublicCommittee): string {
  const state = committeeCapacityState(committee);
  if (state.limit !== null) return capacitySentence(state);

  const { memberCount, minSize } = committee;
  const people = `${memberCount} volunteer${memberCount === 1 ? "" : "s"}`;

  if (minSize && memberCount < minSize) {
    return `${people} so far. We're hoping for at least ${minSize}.`;
  }
  return `${people} so far — everyone's welcome.`;
}

/** True when the form should be replaced by a "contact us" note. */
export function isCommitteeFullWithNoWaitlist(committee: PublicCommittee): boolean {
  return committee.isClosedToNewMembers;
}

export function CommitteeCapacityLine({
  committee,
  className = "",
}: {
  committee: PublicCommittee;
  className?: string;
}) {
  const full = isAtCapacity(committeeCapacityState(committee));

  return (
    <p
      className={`text-sm ${full ? "text-amber-700" : "text-muted-foreground"} ${className}`}
    >
      {committeeCapacityLine(committee)}
    </p>
  );
}
