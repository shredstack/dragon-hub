import type { ReactNode } from "react";
import type { CalendarItem } from "@/lib/calendar-view";

/**
 * How one calendar's items draw themselves, in the four shapes a grid needs.
 *
 * The grids (`CalendarMonthView`, `CalendarWeekView`, `CalendarYearView`) know
 * *which cell* something belongs in and nothing whatsoever about what it is —
 * so a school calendar event and a Meet the Masters slot share one layout while
 * rendering completely differently, and neither can drift out from under the
 * other's grid.
 *
 * A renderer is also where navigation lives: an event chip is a link to
 * `/calendar/[id]`, a slot chip opens the edit dialog. That is why the grids no
 * longer take a `backHref` — it was only ever the item renderer's business.
 */
export interface CalendarRenderers<T extends CalendarItem> {
  /** One line in a desktop month cell. Must survive being narrow. */
  renderChip: (item: T) => ReactNode;
  /** A week column's taller form, allowed to wrap to a few lines. */
  renderBlock: (item: T) => ReactNode;
  /** The full form, for a day panel or the mobile agenda. */
  renderRow: (item: T) => ReactNode;
  /**
   * Tailwind class for the solid dot a mobile month cell shows instead of a
   * chip — density, not identity, so keep it to a background color.
   */
  dotClassName: (item: T) => string;
  /** Shown in a day panel with nothing in it. */
  emptyDayLabel?: string;
}
