"use client";

/**
 * Records the view being looked at, so the next visit reopens it.
 *
 * Renders nothing. It writes on every render of the calendar page rather than
 * on the toggle click, because the view can also arrive from a shared link or
 * a "back to calendar" link — what someone is looking at is the preference,
 * however they got there.
 *
 * `scope` names which calendar is remembering: liking the month grid on the
 * school calendar says nothing about how someone wants to read a committee's
 * schedule. Omitted is the school calendar.
 */

import { useEffect } from "react";
import {
  calendarViewCookie,
  CALENDAR_VIEW_COOKIE_MAX_AGE,
  type CalendarView,
} from "@/lib/calendar-view";

export function CalendarViewMemory({
  view,
  scope,
}: {
  view: CalendarView;
  scope?: string;
}) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie =
      `${calendarViewCookie(scope)}=${view}; path=/; ` +
      `max-age=${CALENDAR_VIEW_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  }, [view, scope]);

  return null;
}
