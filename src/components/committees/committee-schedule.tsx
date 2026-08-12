"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createScheduleSlot,
  updateScheduleSlot,
  deleteScheduleSlot,
  claimScheduleSlot,
  type CommitteeScheduleSlot,
  type CommitteeSlotStatus,
} from "@/actions/committees";
import { Button } from "@/components/ui/button";
import {
  DateTimeRangeField,
  isDateTimeRangeValid,
} from "@/components/ui/date-time-range-field";
import { toDateTimeInputValue } from "@/lib/date-time-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, Calendar } from "lucide-react";
import { normalizeAnchor, type CalendarView } from "@/lib/calendar-view";
import { describeBand, type ScheduleBand } from "@/lib/schedule-bands";
import { CalendarPeriodNav } from "@/components/calendar/calendar-period-nav";
import { CalendarViewToggle } from "@/components/calendar/calendar-view-toggle";
import { CalendarViewMemory } from "@/components/calendar/calendar-view-memory";
import { CalendarMonthView } from "@/components/calendar/calendar-month-view";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import {
  committeeScheduleRenderers,
  toScheduleCalendarItem,
} from "@/components/committees/committee-schedule-items";

/**
 * List, week and month — but no year. Twelve mini-months tinted by density say
 * something about a school calendar with four hundred events on it and nothing
 * at all about a committee with six.
 */
const SCHEDULE_VIEWS: readonly CalendarView[] = ["list", "week", "month"];

/** Where this calendar's remembered view is filed. See `calendarViewCookie`. */
export const SCHEDULE_VIEW_SCOPE = "committee_schedule";

export interface CommitteeScheduleProps {
  committeeId: string;
  slots: CommitteeScheduleSlot[];
  classroomOptions: Array<{ id: string; name: string; gradeLevel: string | null }>;
  /** Chairs and board build the schedule; members read it and may claim a slot. */
  canManage: boolean;
  /** The school's IANA zone — a slot is an instant, so it needs one to render. */
  timeZone: string;
  /** Today in the school's zone, resolved on the server. See `todayDateOnly`. */
  today: string;
  /** The view this reader last used here, from the cookie. */
  initialView?: CalendarView;
  /**
   * The committee's shared materials, if it has any. Rendered as a legend so a
   * member reading the schedule knows *why* two rooms on one morning is
   * sometimes fine and sometimes not. See `schedule-bands.ts`.
   */
  bands?: ScheduleBand[];
}

interface SlotForm {
  title: string;
  classroomId: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  status: CommitteeSlotStatus;
}

const EMPTY_FORM: SlotForm = {
  title: "",
  classroomId: "",
  startsAt: "",
  endsAt: "",
  location: "",
  notes: "",
  status: "proposed",
};

const STATUS_VARIANT: Record<CommitteeSlotStatus, "secondary" | "success" | "default"> = {
  proposed: "secondary",
  confirmed: "success",
  cancelled: "default",
};

function formatWhen(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const dateStr = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (endsAt) {
    const end = new Date(endsAt);
    const endTime = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr}, ${timeStr}–${endTime}`;
  }
  return `${dateStr}, ${timeStr}`;
}

/** Groups slots under a "Month Year" heading for a lightweight calendar feel. */
function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function CommitteeSchedule({
  committeeId,
  slots,
  classroomOptions,
  canManage,
  timeZone,
  today,
  initialView = "month",
  bands = [],
}: CommitteeScheduleProps) {
  const router = useRouter();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The view and period are client state rather than URL params, unlike the
  // school calendar's: this lives inside a Radix tab whose own selection is
  // client state, so navigating would throw the reader back to Messages.
  const [view, setView] = useState<CalendarView>(initialView);
  const [anchor, setAnchor] = useState(() => normalizeAnchor(initialView, today));

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (slot: CommitteeScheduleSlot) => {
    setEditingId(slot.id);
    setForm({
      title: slot.title,
      classroomId: slot.classroomId ?? "",
      startsAt: toDateTimeInputValue(slot.startsAt),
      endsAt: toDateTimeInputValue(slot.endsAt),
      location: slot.location ?? "",
      notes: slot.notes ?? "",
      status: slot.status,
    });
    setError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        classroomId: form.classroomId || null,
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        location: form.location || null,
        notes: form.notes || null,
        status: form.status,
      };
      const { conflictWarning } = editingId
        ? await updateScheduleSlot(editingId, payload)
        : await createScheduleSlot(committeeId, payload);
      setShowForm(false);
      if (conflictWarning) {
        addToast(`Saved. Heads up: ${conflictWarning}`, "default");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the schedule item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (slot: CommitteeScheduleSlot) => {
    const ok = await confirm({
      title: `Delete "${slot.title}"?`,
      description: "This removes it from the committee's schedule for everyone.",
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    try {
      await deleteScheduleSlot(slot.id);
      router.refresh();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Couldn't delete this schedule item.",
        "destructive"
      );
    } finally {
      closeConfirm();
    }
  };

  const handleClaim = async (slot: CommitteeScheduleSlot) => {
    try {
      await claimScheduleSlot(slot.id);
      router.refresh();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Couldn't claim this date.",
        "destructive"
      );
    }
  };

  // Group by month for a calendar-ish read of the list view.
  const groups: Array<{ month: string; items: CommitteeScheduleSlot[] }> = [];
  for (const slot of slots) {
    const month = monthKey(slot.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(slot);
    else groups.push({ month, items: [slot] });
  }

  const slotRow = (slot: CommitteeScheduleSlot) => (
    <SlotRow
      slot={slot}
      canManage={canManage}
      onEdit={openEdit}
      onDelete={handleDelete}
      onClaim={handleClaim}
    />
  );

  const items = useMemo(() => slots.map(toScheduleCalendarItem), [slots]);

  // Clicking a chip does what the row's primary control does: chairs edit,
  // everyone else gets the day panel's full row (with its Claim button), so a
  // member tapping a chip isn't shown a dialog they can't act in.
  //
  // Rebuilt every render rather than memoized: it closes over the handlers,
  // which close over this render's props, and a stale renderer would edit the
  // wrong slot. Building three arrow functions costs nothing.
  const renderers = committeeScheduleRenderers({
    timeZone,
    onOpen: canManage ? openEdit : () => {},
    renderRow: (item) => slotRow(item.slot),
  });

  const empty = (
    <div className="text-muted-foreground py-8 text-center text-sm">
      <Calendar className="mx-auto mb-2 h-6 w-6 opacity-50" />
      {canManage
        ? "No dates yet. Add the first one so everyone can see the plan."
        : "No dates have been scheduled yet."}
    </div>
  );

  return (
    <div className="space-y-4">
      <CalendarViewMemory view={view} scope={SCHEDULE_VIEW_SCOPE} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {view === "list" ? (
          <div />
        ) : (
          <CalendarPeriodNav
            view={view}
            anchor={anchor}
            today={today}
            onSelect={setAnchor}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarViewToggle
            currentView={view}
            anchor={anchor}
            views={SCHEDULE_VIEWS}
            onSelect={(nextView, date) => {
              setView(nextView);
              setAnchor(date);
            }}
          />
          {canManage && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add date
            </Button>
          )}
        </div>
      </div>

      {bands.length > 0 && (
        <div className="border-border bg-muted/40 rounded-md border px-3 py-2">
          <p className="text-xs font-medium">Shared materials</p>
          <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
            {bands.map((band) => (
              <li key={band.id}>
                <span className="font-medium">{band.label}</span> —{" "}
                {describeBand(band)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The whole point of this schedule is that everyone sees every
          classroom's dates — two kindergarten rooms must not book the same
          Tuesday when there's one set of materials. So no classroom filter
          here, deliberately, however private the roster next door is. */}
      {view === "month" && (
        <CalendarMonthView
          items={items}
          anchor={anchor}
          today={today}
          timeZone={timeZone}
          renderers={renderers}
        />
      )}

      {view === "week" && (
        <CalendarWeekView
          items={items}
          anchor={anchor}
          today={today}
          timeZone={timeZone}
          renderers={renderers}
          emptyWeekLabel="Nothing scheduled this week."
        />
      )}

      {view === "list" &&
        (slots.length === 0
          ? empty
          : groups.map((group) => (
              <div key={group.month} className="space-y-2">
                <div className="text-muted-foreground text-sm font-medium">
                  {group.month}
                </div>
                {group.items.map((slot) => (
                  <div key={slot.id}>{slotRow(slot)}</div>
                ))}
              </div>
            )))}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit date" : "Add a date"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="slot-title">What *</Label>
              <Input
                id="slot-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Room 12 — Meet the Masters"
              />
            </div>

            {classroomOptions.length > 0 && (
              <div>
                <Label htmlFor="slot-classroom">Classroom</Label>
                <select
                  id="slot-classroom"
                  value={form.classroomId}
                  onChange={(e) => setForm({ ...form, classroomId: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No specific classroom</option>
                  {classroomOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.gradeLevel ? `${c.gradeLevel} · ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <DateTimeRangeField
              idPrefix="slot"
              startValue={form.startsAt}
              endValue={form.endsAt}
              startRequired
              endHint="Optional — leave blank if it's open-ended."
              onChange={({ startValue, endValue }) =>
                setForm({ ...form, startsAt: startValue, endsAt: endValue })
              }
            />

            <div>
              <Label htmlFor="slot-location">Where</Label>
              <Input
                id="slot-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Art room"
              />
            </div>

            <div>
              <Label htmlFor="slot-notes">Notes</Label>
              <Textarea
                id="slot-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="slot-status">Status</Label>
              <select
                id="slot-status"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as CommitteeSlotStatus })
                }
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="proposed">Proposed — still coordinating</option>
                <option value="confirmed">Confirmed — locked in</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Confirming a time that overlaps another confirmed date still
                saves — you&apos;ll just get a heads-up.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                !form.title.trim() ||
                !form.startsAt ||
                !isDateTimeRangeValid(form.startsAt, form.endsAt)
              }
            >
              {isSaving ? "Saving…" : editingId ? "Save" : "Add date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}

function SlotRow({
  slot,
  canManage,
  onEdit,
  onDelete,
  onClaim,
}: {
  slot: CommitteeScheduleSlot;
  canManage: boolean;
  onEdit: (slot: CommitteeScheduleSlot) => void;
  onDelete: (slot: CommitteeScheduleSlot) => void;
  onClaim: (slot: CommitteeScheduleSlot) => void;
}) {
  const cancelled = slot.status === "cancelled";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={
              cancelled
                ? "text-sm font-medium text-muted-foreground line-through"
                : "text-sm font-medium"
            }
          >
            {slot.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatWhen(slot.startsAt, slot.endsAt)}
            {slot.location && ` · ${slot.location}`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[slot.status]}>{slot.status}</Badge>
            {slot.classroomName && (
              <Badge variant="outline">{slot.classroomName}</Badge>
            )}
            {slot.assigneeName && (
              <span className="text-xs text-muted-foreground">
                {slot.assigneeName}
              </span>
            )}
          </div>
          {slot.notes && (
            <p className="mt-1 text-xs text-muted-foreground">{slot.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {canManage ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => onEdit(slot)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(slot)}>
                Delete
              </Button>
            </>
          ) : (
            !slot.assigneeName &&
            !cancelled && (
              <Button size="sm" variant="outline" onClick={() => onClaim(slot)}>
                Claim
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
