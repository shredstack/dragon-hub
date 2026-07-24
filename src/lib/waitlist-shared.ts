/**
 * The words and the arithmetic of a waitlist, in one place.
 *
 * Two features now put parents in a line — committees and room parents — and a
 * third will eventually. They are different tables with different capacity
 * rules, but a parent reading "2/2 full" on one page and "no spots left" on the
 * next has no way to know it's the same promise. So every string a parent or a
 * board member reads about a waitlist is generated here, and both features
 * import it.
 *
 * Client-safe on purpose: the public signup form, the admin tables and the
 * server actions all pull from this module. Nothing here touches the database —
 * see `src/lib/waitlist.ts` for the query side.
 */

export interface CapacityState {
  /** Seats already taken. */
  taken: number;
  /** The wall. Null means uncapped, which is never "full". */
  limit: number | null;
  /** Whether overflow joins a line or is simply turned away. */
  waitlistEnabled: boolean;
}

/** True when the next volunteer cannot have a seat. Uncapped is never full. */
export function isAtCapacity(state: Pick<CapacityState, "taken" | "limit">): boolean {
  return state.limit !== null && state.taken >= state.limit;
}

/**
 * Full, and with nowhere to put the overflow — the one outcome that's a dead
 * end rather than a slower yes. Callers use it to disable a checkbox or replace
 * a form with a "contact us" note.
 */
export function isDeadEnd(state: CapacityState): boolean {
  return isAtCapacity(state) && !state.waitlistEnabled;
}

/**
 * The parenthetical next to a checkbox: "1/2 spots filled", "2/2 full — join
 * the waitlist". Returns null when there is no cap to report.
 */
export function capacityCountLabel(state: CapacityState): string | null {
  if (state.limit === null) return null;
  const counts = `${state.taken}/${state.limit}`;
  if (!isAtCapacity(state)) return `${counts} spots filled`;
  return state.waitlistEnabled
    ? `${counts} full — join the waitlist`
    : `${counts} full`;
}

/**
 * The full sentence version, for a page with room to breathe (a committee join
 * page, the room parent signup intro).
 */
export function capacitySentence(state: CapacityState): string {
  if (state.limit === null) return "";
  if (!isAtCapacity(state)) {
    return `${state.taken} of ${state.limit} spots filled.`;
  }
  return state.waitlistEnabled
    ? `All ${state.limit} spots are filled. Join the waitlist and we'll email you if one opens.`
    : `All ${state.limit} spots are filled.`;
}

/** What the submit button says when the form will produce a waitlist entry. */
export function joinButtonLabel(state: CapacityState, joinLabel: string): string {
  return isAtCapacity(state) && state.waitlistEnabled
    ? "Join the waitlist"
    : joinLabel;
}

/** "#3 in line — we'll email you if a spot opens." */
export function waitlistPositionNote(position: number): string {
  return `#${position} in line — we'll email you if a spot opens.`;
}

/** Heading over the list of things a parent just got waitlisted for. */
export const WAITLIST_SUMMARY_TITLE = "You're on the waitlist for:";

/** The emoji every waitlist surface uses, so a parent recognises the state. */
export const WAITLIST_ICON = "📋";

/**
 * The confirmation shown to a board member promoting someone out of order.
 * Position 1 is the person the automation would have taken anyway, so it says
 * so rather than implying a queue was jumped.
 */
export function promoteConfirmCopy(params: {
  name: string;
  position: number;
  /** "the Yearbook Committee", "Room 12" — where the seat is. */
  where?: string;
}): { title: string; description: string } {
  const { name, position, where } = params;
  const ahead = position - 1;
  return {
    title: where
      ? `Give ${name} a spot in ${where}?`
      : `Give ${name} a spot?`,
    description:
      ahead > 0
        ? `They're #${position} in line. The ${ahead} ${
            ahead === 1 ? "person" : "people"
          } ahead of them keep their order.`
        : "They're next in line anyway.",
  };
}

/** The confirmation for taking someone off a waitlist entirely. */
export function removeFromWaitlistCopy(name: string): {
  title: string;
  description: string;
} {
  return {
    title: `Take ${name} off the waitlist?`,
    description: "They won't be notified. Everyone behind them moves up.",
  };
}

/**
 * The standing explanation of how a waitlist behaves, shown above every admin
 * waitlist. Promotion is automatic, so the table needs to say why it exists.
 */
export const WAITLIST_ADMIN_BLURB =
  "A spot opening promotes #1 automatically and emails them. Promote out of order only when you have a reason to.";
