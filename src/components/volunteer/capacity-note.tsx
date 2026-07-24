import {
  capacityCountLabel,
  isAtCapacity,
  type CapacityState,
} from "@/lib/waitlist-shared";

/**
 * The parenthetical next to a checkbox on the signup page — "(1/2 spots
 * filled)", "(2/2 full — join the waitlist)".
 *
 * One component for every capped thing a parent can check: the Room Parent row,
 * a per-classroom committee (Meet the Masters), whatever comes next. They sit
 * inside the same classroom card, so a parent reads them as one list; two
 * near-identical spans that drifted apart would read as two different rules.
 *
 * Amber, not red, when full and a waitlist is open: it is a slower yes, not a
 * refusal. Red is reserved for the dead end.
 */
export function CapacityNote({
  state,
  className = "",
}: {
  state: CapacityState;
  className?: string;
}) {
  const label = capacityCountLabel(state);
  if (!label) return null;

  const full = isAtCapacity(state);
  const tone = !full
    ? "text-muted-foreground"
    : state.waitlistEnabled
      ? "text-amber-700"
      : "text-red-600";

  return <span className={`text-xs ${tone} ${className}`}>({label})</span>;
}
