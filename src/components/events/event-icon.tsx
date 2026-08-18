import Image from "next/image";
import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An event's tile — the icon its recurring-event entry carries, or the generic
 * clipboard when it has none.
 *
 * The icon is set once on the recurring event (`/admin/board/event-catalog`)
 * and every year's plan inherits it, so Field Day looks like Field Day on the
 * catalog, on the plan list, and at the top of the plan itself. Rendering it in
 * one component is what keeps those three agreeing.
 *
 * Image beats emoji when both are set, matching what the icon picker promises.
 */
export function EventIcon({
  iconEmoji,
  imageUrl,
  className,
}: {
  iconEmoji?: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  const classes = cn(
    "bg-dragon-blue-100 text-dragon-blue-600 relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md text-xl leading-none",
    className
  );

  if (imageUrl) {
    return (
      <span className={classes} aria-hidden>
        {/* unoptimized: these are Vercel Blob uploads a board member chose,
            already sized for a tile, and not worth a transform per size. */}
        <Image src={imageUrl} alt="" fill className="object-cover" sizes="40px" unoptimized />
      </span>
    );
  }

  return (
    <span className={classes} aria-hidden>
      {iconEmoji ? iconEmoji : <ClipboardList className="h-5 w-5" />}
    </span>
  );
}
