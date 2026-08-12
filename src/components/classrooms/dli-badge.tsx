import { Badge } from "@/components/ui/badge";

export interface DliBadgeProps {
  /** Whether the classroom is flagged as DLI at all. */
  isDli: boolean | null | undefined;
  /** The configured group's name, e.g. "Red DLI". Null when unassigned. */
  groupName: string | null | undefined;
  /** Optional hex colour the board picked for the group. */
  groupColor?: string | null;
  /**
   * What to show for a DLI room with no group configured. Defaults to a plain
   * "DLI" — admin screens pass "DLI (no group)" because there the missing
   * assignment is something to go fix.
   */
  fallbackLabel?: string;
  className?: string;
}

/**
 * The one place a DLI group renders as a badge.
 *
 * Parents identify their homeroom by "Red DLI" / "Blue DLI" far more reliably
 * than by the teacher's name, so this rides alongside the name wherever a room
 * is picked, not just on admin screens. Returns null for a non-DLI room, which
 * is what lets callers drop it into a list without a conditional.
 */
export function DliBadge({
  isDli,
  groupName,
  groupColor,
  fallbackLabel = "DLI",
  className,
}: DliBadgeProps) {
  if (!isDli) return null;

  if (!groupName) {
    return (
      <Badge variant="secondary" className={className}>
        {fallbackLabel}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={className}
      style={
        groupColor ? { borderColor: groupColor, color: groupColor } : undefined
      }
    >
      {groupName}
    </Badge>
  );
}
