import {
  WAITLIST_ICON,
  WAITLIST_SUMMARY_TITLE,
  waitlistPositionNote,
} from "@/lib/waitlist-shared";

export interface WaitlistPlacement {
  /** What they're waiting for — a committee name, a classroom name. */
  name: string;
  /** 1-based place in line. */
  position: number;
  /** Optional qualifier, e.g. the role within that classroom. */
  detail?: string;
}

/**
 * The "you're on the waitlist for:" block on a signup confirmation screen.
 *
 * One submission can produce waitlist placements from more than one feature — a
 * full classroom and a full committee, from the same form — so they render
 * through one component rather than each growing their own amber card.
 */
export function WaitlistSummary({
  placements,
  title = WAITLIST_SUMMARY_TITLE,
}: {
  placements: WaitlistPlacement[];
  title?: string;
}) {
  if (placements.length === 0) return null;

  return (
    <div className="mx-auto max-w-sm space-y-2 text-left">
      <div className="text-sm font-medium">{title}</div>
      {placements.map((placement) => (
        <div
          key={`${placement.name}-${placement.detail ?? ""}`}
          className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <span>{WAITLIST_ICON}</span>
          <div>
            <div className="font-medium">
              {placement.name}
              {placement.detail && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {placement.detail}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {waitlistPositionNote(placement.position)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
