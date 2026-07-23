import type { PublicCommittee } from "@/actions/committees";

/**
 * The one-line "how full is this?" copy, shared by the standalone join page and
 * the room parent add-on so a parent reads the same sentence either way.
 *
 * Every branch here maps to a configuration the board chose deliberately — an
 * open committee never mentions a cap, and a capped one never says "everyone's
 * welcome".
 */
export function committeeCapacityLine(committee: PublicCommittee): string {
  const { memberCount, minSize, maxSize, capacityMode, waitlistEnabled } = committee;
  const people = `${memberCount} volunteer${memberCount === 1 ? "" : "s"}`;

  if (capacityMode === "capped" && maxSize !== null) {
    if (memberCount >= maxSize) {
      return waitlistEnabled
        ? `All ${maxSize} spots are filled. Join the waitlist and we'll email you if one opens.`
        : `All ${maxSize} spots are filled.`;
    }
    return `${memberCount} of ${maxSize} spots filled.`;
  }

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
  const full =
    committee.capacityMode === "capped" &&
    committee.maxSize !== null &&
    committee.memberCount >= committee.maxSize;

  return (
    <p
      className={`text-sm ${full ? "text-amber-700" : "text-muted-foreground"} ${className}`}
    >
      {committeeCapacityLine(committee)}
    </p>
  );
}
