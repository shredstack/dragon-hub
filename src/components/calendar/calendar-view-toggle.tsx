"use client";

/**
 * List / Week / Month / Year.
 *
 * Two navigation modes, because the two calendars that use it live differently.
 * The school calendar is its own page, so its view belongs in the URL and is
 * rendered as links — it survives a refresh, a share, and the back button. A
 * committee's schedule lives inside a Radix tab whose own state is client-side,
 * so a URL change there would throw the reader back to the Messages tab; that
 * caller passes `onSelect` and gets buttons.
 *
 * Exactly one of `hrefFor` / `onSelect` is expected. Passing both is a caller
 * bug rather than a supported mix, so `hrefFor` simply wins.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  normalizeAnchor,
  type CalendarView,
} from "@/lib/calendar-view";

interface CalendarViewToggleProps {
  currentView: CalendarView;
  /** The day being viewed, so switching views keeps you in the same period. */
  anchor: string;
  /**
   * Which views this calendar offers. Defaults to all four; a committee
   * schedule drops "year", where twelve mini-months of four presentations
   * would say nothing.
   */
  views?: readonly CalendarView[];
  /**
   * Link mode. Receives the view and the *re-anchored* day, so jumping from a
   * week in August to the month view lands on August rather than carrying the
   * day through unchanged.
   */
  hrefFor?: (view: CalendarView, date: string) => string;
  /** Button mode, for a calendar whose view is client state. */
  onSelect?: (view: CalendarView, date: string) => void;
}

export function CalendarViewToggle({
  currentView,
  anchor,
  views = CALENDAR_VIEWS,
  hrefFor,
  onSelect,
}: CalendarViewToggleProps) {
  return (
    <div
      className="border-border bg-card inline-flex rounded-lg border p-1"
      role="group"
      aria-label="Calendar view"
    >
      {views.map((view) => {
        const date = normalizeAnchor(view, anchor);
        const isCurrent = currentView === view;
        const className = cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isCurrent
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted"
        );

        return hrefFor ? (
          <Link
            key={view}
            href={hrefFor(view, date)}
            aria-current={isCurrent ? "page" : undefined}
            className={className}
          >
            {CALENDAR_VIEW_LABELS[view]}
          </Link>
        ) : (
          <button
            key={view}
            type="button"
            onClick={() => onSelect?.(view, date)}
            aria-pressed={isCurrent}
            className={className}
          >
            {CALENDAR_VIEW_LABELS[view]}
          </button>
        );
      })}
    </div>
  );
}
