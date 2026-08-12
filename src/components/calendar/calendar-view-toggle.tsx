/**
 * List / Week / Month / Year. Plain links rather than client state, so the view
 * lives in the URL and survives a refresh, a share, and the back button.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  buildCalendarHref,
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  normalizeAnchor,
  type CalendarView,
} from "@/lib/calendar-view";

interface CalendarViewToggleProps {
  currentView: CalendarView;
  /** The day being viewed, so switching views keeps you in the same period. */
  anchor: string;
  type: string | undefined;
  calendar: string | undefined;
}

export function CalendarViewToggle({
  currentView,
  anchor,
  type,
  calendar,
}: CalendarViewToggleProps) {
  return (
    <div
      className="border-border bg-card inline-flex rounded-lg border p-1"
      role="group"
      aria-label="Calendar view"
    >
      {CALENDAR_VIEWS.map((view) => (
        <Link
          key={view}
          href={buildCalendarHref({
            view,
            // Re-anchor rather than carrying the day through unchanged, so
            // jumping from a week in August to the month view lands on August.
            date: normalizeAnchor(view, anchor),
            type,
            calendar,
          })}
          aria-current={currentView === view ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            currentView === view
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {CALENDAR_VIEW_LABELS[view]}
        </Link>
      ))}
    </div>
  );
}
