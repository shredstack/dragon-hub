"use client";

/**
 * The month grid, for the school calendar page.
 *
 * `CalendarMonthView` keeps the selected day in local state, so it has to be a
 * client component — and a client component cannot be handed the `renderers`
 * object, because its fields are functions and functions don't cross that
 * boundary. So the renderers are built *here*, on the client, from the two
 * plain strings they actually need.
 *
 * The list, week and year views have no client state and are rendered straight
 * from the page, which is why only this one needs a wrapper.
 */

import { useMemo } from "react";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { schoolCalendarRenderers } from "@/components/calendar/calendar-event-items";
import type { CalendarViewEvent } from "@/lib/calendar-view";

interface SchoolCalendarMonthProps {
  items: CalendarViewEvent[];
  /** First day of the month being shown. */
  anchor: string;
  /** Today in the school's zone. */
  today: string;
  timeZone: string;
  /** Carried onto each event link so "back" returns to this view. */
  backHref: string;
}

export function SchoolCalendarMonth({
  items,
  anchor,
  today,
  timeZone,
  backHref,
}: SchoolCalendarMonthProps) {
  const renderers = useMemo(
    () => schoolCalendarRenderers(timeZone, backHref),
    [timeZone, backHref]
  );

  return (
    <CalendarMonthView
      items={items}
      anchor={anchor}
      today={today}
      timeZone={timeZone}
      renderers={renderers}
    />
  );
}
