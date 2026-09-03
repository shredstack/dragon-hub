"use client";

import { useState, useTransition } from "react";
import {
  recordHoursForVolunteer,
  undoRecordedHours,
  type RecordHoursResult,
} from "@/actions/volunteer-hours";
import { VOLUNTEER_CATEGORIES } from "@/lib/constants";
import {
  DEFAULT_ACTIVITIES,
  OTHER_ACTIVITY_VALUE,
  isKnownVolunteerCategory,
  type VolunteerActivityOption,
  type VolunteerActivityOptions,
} from "@/lib/volunteer-activities-shared";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/ui/category-select";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { VolunteerPicker, type PickedVolunteer } from "./volunteer-picker";

/**
 * Typing up the sheet from the monthly PTA meeting.
 *
 * The shape of the job is one event, one date, and a column of names and hours
 * beneath it — so the activity, date and category stay put between entries and
 * only the person and their hours reset. Everything added in this sitting stays
 * listed underneath with an Undo beside it, because the mis-keyed line is
 * always the one you notice two names later.
 */

interface Props {
  options: VolunteerActivityOptions;
  /** Today in the school's own time zone — a form that opens on tomorrow's
   *  date because the server is in UTC is how a whole sheet lands a day out. */
  today: string;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

const emptyVolunteer: PickedVolunteer = { userId: null, name: "", email: "" };

export function AddHoursForm({ options, today }: Props) {
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();

  const [volunteer, setVolunteer] = useState<PickedVolunteer>(emptyVolunteer);
  const [resetKey, setResetKey] = useState(0);
  const [activity, setActivity] = useState("");
  const [otherName, setOtherName] = useState("");
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [approved, setApproved] = useState(true);
  const [invite, setInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<RecordHoursResult[]>([]);

  const groups: Array<{ label: string; items: VolunteerActivityOption[] }> = [
    { label: "PTA events", items: options.events },
    { label: "Classrooms", items: options.classrooms },
    { label: "Committees", items: options.committees },
    { label: "General", items: DEFAULT_ACTIVITIES },
  ].filter((group) => group.items.length > 0);

  function handleActivityChange(value: string) {
    setActivity(value);
    setError(null);
    if (categoryTouched || value === OTHER_ACTIVITY_VALUE) return;

    const suggested = [
      ...options.events,
      ...options.classrooms,
      ...options.committees,
      ...DEFAULT_ACTIVITIES,
    ].find((option) => option.value === value)?.suggestedCategory;

    if (suggested && isKnownVolunteerCategory(suggested)) setCategory(suggested);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const name = volunteer.name.trim();
    if (!name) {
      setError("Whose hours are these?");
      return;
    }

    const eventName =
      activity === OTHER_ACTIVITY_VALUE ? otherName.trim() : activity;
    if (!eventName) {
      setError("Say what these hours were for.");
      return;
    }
    if (!hours.trim()) {
      setError("How many hours?");
      return;
    }

    startTransition(async () => {
      let result: RecordHoursResult;
      try {
        result = await recordHoursForVolunteer({
          userId: volunteer.userId,
          name,
          email: volunteer.email.trim() || null,
          eventName,
          hours,
          date,
          category: category || null,
          notes: notes.trim() || null,
          approved,
          invite,
        });
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not record those hours."
        );
        return;
      }

      haptic("success");
      setAdded((current) => [result, ...current]);
      addToast(
        result.warning ??
          `${result.hours} hours recorded for ${result.volunteerName}${
            result.invited ? " — sign-in link sent." : "."
          }`,
        result.warning ? "default" : "success"
      );

      // The next name on the sheet is a different person doing the same thing
      // on the same day, so only the person and their hours clear.
      setVolunteer(emptyVolunteer);
      setHours("");
      setNotes("");
      setResetKey((key) => key + 1);
    });
  }

  function handleUndo(id: string) {
    startTransition(async () => {
      const { removed } = await undoRecordedHours(id);
      if (!removed) {
        addToast("That entry can no longer be undone here.", "default");
        setAdded((current) => current.filter((entry) => entry.id !== id));
        return;
      }
      setAdded((current) => current.filter((entry) => entry.id !== id));
      addToast("Entry removed.", "success");
    });
  }

  const showInviteToggle =
    !volunteer.userId && volunteer.email.trim().length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
      >
        <VolunteerPicker
          value={volunteer}
          onChange={setVolunteer}
          resetKey={resetKey}
        />

        <div>
          <label className="mb-1 block text-sm font-medium">
            Event or activity
          </label>
          <select
            required
            value={activity}
            onChange={(event) => handleActivityChange(event.target.value)}
            className={inputClass}
          >
            <option value="">Select an event or activity</option>
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={`${group.label}:${item.value}`} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={OTHER_ACTIVITY_VALUE}>Other (not listed)</option>
          </select>
        </div>

        {activity === OTHER_ACTIVITY_VALUE && (
          <div>
            <label className="mb-1 block text-sm font-medium">What was it?</label>
            <input
              value={otherName}
              onChange={(event) => {
                setOtherName(event.target.value);
                setError(null);
              }}
              placeholder="e.g. Playground mulch delivery"
              className={inputClass}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Hours</label>
            <input
              type="number"
              step="0.25"
              min="0.25"
              required
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <CategorySelect
            set={VOLUNTEER_CATEGORIES}
            required
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setCategoryTouched(true);
            }}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Notes <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={inputClass}
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={approved}
            onChange={(event) => setApproved(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Approve straight away
            <span className="block text-xs text-muted-foreground">
              You&apos;re reading it off the sheet — untick to send it to the
              approval queue instead.
            </span>
          </span>
        </label>

        {showInviteToggle && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={invite}
              onChange={(event) => setInvite(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Email them a sign-in link
              <span className="block text-xs text-muted-foreground">
                Only sent to someone who doesn&apos;t have a DragonHub account
                yet.
              </span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Recording…" : "Record hours"}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Added just now</h2>
          <p className="text-sm text-muted-foreground">
            {added.length === 0
              ? "Entries you record will be listed here so you can check them off the sheet."
              : `${added.length} ${added.length === 1 ? "entry" : "entries"} in this sitting.`}
          </p>
        </div>
        {added.length > 0 && (
          <ul className="divide-y divide-border">
            {added.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{entry.volunteerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.hours} hrs · {entry.eventName} ·{" "}
                    {formatDate(entry.date)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <Tag>{entry.approved ? "Approved" : "Pending"}</Tag>
                    {entry.linked && <Tag>Linked to their account</Tag>}
                    {entry.invited && <Tag>Sign-in link sent</Tag>}
                    {!entry.linked && !entry.volunteerEmail && (
                      <Tag tone="warning">No email on file</Tag>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUndo(entry.id)}
                  disabled={pending}
                  className="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tag({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <span
      className={
        tone === "warning"
          ? "rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}
