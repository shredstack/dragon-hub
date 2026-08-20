"use client";

import Link from "next/link";
import { Clock, Users } from "lucide-react";
import { EventIcon } from "@/components/events/event-icon";
import { CategoryBadge } from "@/components/ui/category-badge";
import { CapacityNote } from "@/components/volunteer/capacity-note";
import { EventReactionBar } from "@/components/events/event-reaction-bar";
import { EventHandRaise } from "@/components/events/event-hand-raise";
import { EVENT_CATEGORIES } from "@/lib/constants";
import {
  eventTimingLine,
  type DirectoryEntry,
} from "@/lib/event-directory-shared";

/**
 * One event in the window.
 *
 * The whole card is a link to the event's page, and the controls on it are
 * real `<button>`s that stop propagation — a parent tapping ❤️ wants the heart,
 * not the detail page. That is why this is a client component even though most
 * of it is static.
 */
export function EventDirectoryCard({
  entry,
  reactionsEnabled,
  customEmojiEnabled,
}: {
  entry: DirectoryEntry;
  reactionsEnabled: boolean;
  customEmojiEnabled: boolean;
}) {
  const timing = eventTimingLine(entry);

  return (
    // A stretched link rather than an anchor wrapping the whole card: the
    // reaction pills and the hand-raise are real buttons, and a `<button>`
    // inside an `<a>` is invalid HTML that screen readers read as one control.
    // The overlay makes the card tappable; `relative z-10` lifts the controls
    // back above it.
    <div className="group border-border bg-card hover:border-dragon-blue-400 focus-within:ring-ring relative flex flex-col rounded-lg border p-4 transition-colors focus-within:ring-2">
      <Link
        href={`/events/${entry.slug}`}
        className="absolute inset-0 rounded-lg focus:outline-none"
      >
        <span className="sr-only">{entry.title}</span>
      </Link>
      <div className="flex items-start gap-3">
        <EventIcon
          iconEmoji={entry.iconEmoji}
          imageUrl={entry.imageUrl}
          className="h-12 w-12 text-2xl"
        />
        <div className="min-w-0 flex-1">
          <h3 className="leading-tight font-semibold">{entry.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <CategoryBadge set={EVENT_CATEGORIES} value={entry.category} />
            {timing && (
              <span className="text-muted-foreground text-sm">{timing}</span>
            )}
          </div>
        </div>
      </div>

      {entry.description && (
        <p className="text-muted-foreground mt-3 line-clamp-3 text-sm">
          {entry.description}
        </p>
      )}

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {entry.timeCommitment && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {entry.timeCommitment}
          </span>
        )}
        {entry.estimatedVolunteers && (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {entry.estimatedVolunteers}
          </span>
        )}
        {/* Renders nothing when the event is uncapped, which is the point:
            "unlimited" is not a fact worth a line. */}
        <CapacityNote state={entry.capacity} className="text-xs" />
      </div>

      {entry.plan?.planningStarted && (
        <p className="text-muted-foreground mt-2 text-xs">
          Planning has started
          {entry.plan.leadNames.length > 0 &&
            ` — ${entry.plan.leadNames.join(", ")}`}
        </p>
      )}

      {/* Pushed to the bottom so a row of cards lines its controls up even when
          the descriptions are different lengths. `relative z-10` puts them
          above the stretched link, so a tap on ❤️ is a heart and not a
          navigation. */}
      <div className="relative z-10 mt-auto space-y-3 pt-4">
        {reactionsEnabled && (
          <EventReactionBar
            eventCatalogId={entry.id}
            reactions={entry.reactions}
            customEmojiEnabled={customEmojiEnabled}
          />
        )}
        <EventHandRaise
          eventCatalogId={entry.id}
          interest={entry.myInterest}
          note={entry.myInterestNote}
        />
      </div>
    </div>
  );
}
