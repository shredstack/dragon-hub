"use client";

/**
 * How a Meet the Masters slot draws itself inside the shared calendar grids.
 *
 * The counterpart of `calendar-event-items.tsx` for the school calendar: the
 * grids in `src/components/calendar/` decide *which cell*, this file decides
 * what's in it. Everything committee-specific lives here — the status colours,
 * the classroom badge, and the fact that clicking opens a dialog instead of
 * navigating to a detail page (a slot has no page of its own).
 */

import type { CommitteeScheduleSlot, CommitteeSlotStatus } from "@/actions/committees";
import { cn } from "@/lib/utils";
import {
  compactTimeLabel,
  type CalendarItem,
} from "@/lib/calendar-view";
import { formatTimeInTimeZone } from "@/lib/time-zone";
import type { CalendarRenderers } from "@/components/calendar/calendar-renderers";

/**
 * A slot in the shape the grids lay out, carrying the slot itself so a renderer
 * can reach the committee-specific fields the grid never looks at.
 *
 * `allDay` is always false and `timeZone` always null: a presentation happens at
 * a time, and slots are entered by someone at the school, so the school's zone
 * (which `eventTimeZone` falls back to) is the right one.
 */
export interface ScheduleCalendarItem extends CalendarItem {
  slot: CommitteeScheduleSlot;
}

export function toScheduleCalendarItem(
  slot: CommitteeScheduleSlot
): ScheduleCalendarItem {
  return {
    id: slot.id,
    title: slot.title,
    startTime: slot.startsAt,
    endTime: slot.endsAt,
    allDay: false,
    timeZone: null,
    slot,
  };
}

/**
 * Status is the axis that matters at a glance here — "is this date locked in?"
 * — which is why it gets the colour rather than the classroom. Two kindergarten
 * rooms both eyeing the same Tuesday need to see instantly which one is real.
 */
const STATUS_CHIP: Record<CommitteeSlotStatus, string> = {
  proposed: "bg-dragon-gold-100 text-dragon-gold-700",
  confirmed: "bg-dragon-blue-100 text-dragon-blue-700",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_DOT: Record<CommitteeSlotStatus, string> = {
  proposed: "bg-dragon-gold-500",
  confirmed: "bg-dragon-blue-500",
  cancelled: "bg-muted-foreground",
};

/** A single line in a month cell. */
function SlotChip({
  item,
  timeZone,
  onOpen,
}: {
  item: ScheduleCalendarItem;
  timeZone: string;
  onOpen: (slot: CommitteeScheduleSlot) => void;
}) {
  const { slot } = item;
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      title={slot.title}
      className={cn(
        "flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs transition-opacity hover:opacity-80",
        STATUS_CHIP[slot.status]
      )}
    >
      <span className="shrink-0 font-medium opacity-75">
        {compactTimeLabel(slot.startsAt, timeZone)}
      </span>
      <span
        className={cn("truncate", slot.status === "cancelled" && "line-through")}
      >
        {slot.classroomName ?? slot.title}
      </span>
    </button>
  );
}

/** The week column's taller form. */
function SlotBlock({
  item,
  timeZone,
  onOpen,
}: {
  item: ScheduleCalendarItem;
  timeZone: string;
  onOpen: (slot: CommitteeScheduleSlot) => void;
}) {
  const { slot } = item;
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className={cn(
        "block w-full rounded p-1.5 text-left text-xs transition-opacity hover:opacity-80",
        STATUS_CHIP[slot.status]
      )}
    >
      <span className="font-medium opacity-75">
        {formatTimeInTimeZone(slot.startsAt, timeZone)}
      </span>
      <span
        className={cn(
          "line-clamp-2 block font-medium",
          slot.status === "cancelled" && "line-through"
        )}
      >
        {slot.title}
      </span>
      {slot.classroomName && (
        <span className="mt-0.5 line-clamp-1 block opacity-75">
          {slot.classroomName}
        </span>
      )}
    </button>
  );
}

/**
 * Everything a grid needs to lay out one committee's schedule.
 *
 * `renderRow` is supplied by the caller rather than defined here, so the day
 * panel shows the same full row — with its Edit / Delete / Claim controls —
 * that the list view shows. There is exactly one slot row in the app.
 */
export function committeeScheduleRenderers({
  timeZone,
  onOpen,
  renderRow,
}: {
  timeZone: string;
  onOpen: (slot: CommitteeScheduleSlot) => void;
  renderRow: (item: ScheduleCalendarItem) => React.ReactNode;
}): CalendarRenderers<ScheduleCalendarItem> {
  return {
    renderChip: (item) => (
      <SlotChip item={item} timeZone={timeZone} onOpen={onOpen} />
    ),
    renderBlock: (item) => (
      <SlotBlock item={item} timeZone={timeZone} onOpen={onOpen} />
    ),
    renderRow,
    dotClassName: (item) => STATUS_DOT[item.slot.status],
    emptyDayLabel: "Nothing scheduled this day.",
  };
}
