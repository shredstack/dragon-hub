import { Lock, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  describeAudiences,
  type AudienceRow,
} from "@/lib/knowledge-audience-shared";

/**
 * Who an article is shared with, as chips.
 *
 * Board-only gets a lock and a distinct amber treatment rather than another
 * neutral chip: on a list of thirty articles the one question the board asks is
 * "which of these have I actually shared?", and that has to be answerable
 * without reading labels.
 */
export function AudienceBadges({
  audiences,
  className = "",
}: {
  audiences: AudienceRow[];
  className?: string;
}) {
  const labels = describeAudiences(audiences);

  if (audiences.length === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ${className}`}
      >
        <Lock className="h-3 w-3" />
        Board only
      </span>
    );
  }

  const isEveryone = audiences.some((a) => a.audienceType === "everyone");

  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {labels.map((label) => (
        <Badge key={label} variant="secondary">
          {isEveryone && <Globe className="mr-1 h-3 w-3" />}
          {label}
        </Badge>
      ))}
    </span>
  );
}
