import { School } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A classroom's tile — its emoji if the room picked one, the generic school
 * icon if it hasn't.
 *
 * Shared by the card on `/classrooms` and the room's own header so that picking
 * an emoji changes the same square in both places.
 */
export function ClassroomIcon({
  iconEmoji,
  className,
}: {
  iconEmoji?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-dragon-blue-100 text-dragon-blue-600 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xl leading-none",
        className
      )}
      aria-hidden
    >
      {iconEmoji ? iconEmoji : <School className="h-5 w-5" />}
    </span>
  );
}
