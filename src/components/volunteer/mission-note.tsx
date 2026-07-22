import { PTA_MISSION, MISSION_VOLUNTEER_NOTE } from "@/lib/mission";

/**
 * The send-off under the public volunteer forms.
 *
 * Deliberately below the card rather than inside it: the copy above the form is
 * board-editable, and a second voice competing with theirs in the same panel
 * reads as clutter. Down here it's the last thing a parent sees after they
 * submit — the reason the ask was worth answering.
 */
export function MissionNote() {
  return (
    <div className="mt-8 border-t border-border pt-6 text-center">
      <p className="text-sm font-medium text-foreground">
        {MISSION_VOLUNTEER_NOTE}
      </p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        The PTA exists &ldquo;{PTA_MISSION}.&rdquo;
      </p>
    </div>
  );
}
