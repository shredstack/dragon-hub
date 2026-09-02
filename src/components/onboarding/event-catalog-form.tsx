"use client";

import type { BoardPosition } from "@/lib/board-positions-shared";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagPicker } from "@/components/ui/tag-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { Plus, Loader2, X, AlertTriangle, Eye } from "lucide-react";
import {
  createCatalogEntry,
  updateCatalogEntry,
  findSimilarCatalogEntries,
} from "@/actions/event-catalog";
import type { EventCatalogEntry } from "@/types";
import { parseStoredList, serializeList } from "@/lib/utils";
import { CategorySelect } from "@/components/ui/category-select";
import {
  EVENT_CATEGORIES,
  EVENT_TYPES,
  MONTHS,
  monthLabel,
} from "@/lib/constants";

interface EventCatalogFormProps {
  editingEntry?: EventCatalogEntry;
  /** The school's active board positions, for the related-positions picker. */
  positions: BoardPosition[];
  availableTags?: { name: string; displayName: string }[];
  /**
   * Called after a successful save. A *create* hands back the new entry's id and
   * title, so the page can offer what comes next — opening this year's plan for
   * it, and adding its contacts — without the board going looking for a
   * different screen. An edit passes nothing.
   */
  onSuccess?: (created?: { id: string; title: string }) => void;
  onCancel?: () => void;
  showToggleButton?: boolean;
}

interface SimilarEntry {
  id: string;
  title: string;
  typicalMonth: number | null;
}

export function EventCatalogForm({
  editingEntry,
  positions,
  availableTags = [],
  onSuccess,
  onCancel,
  showToggleButton = true,
}: EventCatalogFormProps) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(!showToggleButton || !!editingEntry);
  const [error, setError] = useState<string | null>(null);

  // Near-duplicate titles found on blur. The catalog is only useful if it holds
  // one row per real event, so a second "Field Day" gets challenged before it's
  // created — but never blocked, since two genuinely different fall fundraisers
  // are also possible.
  const [similar, setSimilar] = useState<SimilarEntry[]>([]);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  // "Preview as a family" — the board reads its own description the way the
  // school will. Ships with the migration so the catalog gets skimmed once.
  const [previewing, setPreviewing] = useState(false);

  const [formData, setFormData] = useState({
    title: editingEntry?.title ?? "",
    category: editingEntry?.category ?? "",
    description: editingEntry?.description ?? "",
    typicalMonth: editingEntry?.typicalMonth?.toString() ?? "",
    timingNote: editingEntry?.timingNote ?? "",
    estimatedVolunteers: editingEntry?.estimatedVolunteers ?? "",
    estimatedBudget: editingEntry?.estimatedBudget ?? "",
    defaultEventType: editingEntry?.defaultEventType ?? "",
    defaultLocation: editingEntry?.defaultLocation ?? "",
    // Both columns store a JSON array; the textareas below edit them as one
    // item per line. parseStoredList also tolerates entries that were saved as
    // plain text before this round-trip existed.
    keyTasks: parseStoredList(editingEntry?.keyTasks).join("\n"),
    tips: parseStoredList(editingEntry?.tips).join("\n"),
    tags: editingEntry?.tags ?? ([] as string[]),
    relatedPositions: editingEntry?.relatedPositions ?? ([] as string[]),
    volunteerResponsibilities: editingEntry?.volunteerResponsibilities ?? "",
    timeCommitment: editingEntry?.timeCommitment ?? "",
    iconEmoji: editingEntry?.iconEmoji ?? "",
    imageUrl: editingEntry?.imageUrl ?? "",
    // Our Events. Defaults match the columns: in the window, uncapped, and a
    // waitlist rather than a closed door.
    showInDirectory: editingEntry?.showInDirectory ?? true,
    helpCap: editingEntry?.helpCap?.toString() ?? "",
    helpWaitlistEnabled: editingEntry?.helpWaitlistEnabled ?? true,
  });

  const resetForm = () => {
    setFormData({
      title: "",
      category: "",
      description: "",
      typicalMonth: "",
      timingNote: "",
      estimatedVolunteers: "",
      estimatedBudget: "",
      defaultEventType: "",
      defaultLocation: "",
      keyTasks: "",
      tips: "",
      tags: [],
      relatedPositions: [],
      volunteerResponsibilities: "",
      timeCommitment: "",
      iconEmoji: "",
      imageUrl: "",
      showInDirectory: true,
      helpCap: "",
      helpWaitlistEnabled: true,
    });
    setSimilar([]);
    setDuplicateAcknowledged(false);
    setError(null);
    setShowForm(false);
    onCancel?.();
  };

  const checkForDuplicates = () => {
    if (!formData.title.trim()) return;
    startTransition(async () => {
      const matches = await findSimilarCatalogEntries(
        formData.title,
        editingEntry?.id
      );
      setSimilar(matches);
      setDuplicateAcknowledged(false);
    });
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const data = {
        title: formData.title,
        category: formData.category || undefined,
        description: formData.description || undefined,
        typicalMonth: formData.typicalMonth
          ? Number(formData.typicalMonth)
          : null,
        timingNote: formData.timingNote || undefined,
        estimatedVolunteers: formData.estimatedVolunteers || undefined,
        estimatedBudget: formData.estimatedBudget || undefined,
        // "" rather than undefined so clearing these actually clears them —
        // the update action skips keys it doesn't receive.
        defaultEventType: formData.defaultEventType,
        defaultLocation: formData.defaultLocation,
        // "" rather than undefined so clearing the textarea actually clears
        // the column — the update action skips keys it doesn't receive.
        keyTasks: serializeList(formData.keyTasks) ?? "",
        tips: serializeList(formData.tips) ?? "",
        tags: formData.tags,
        relatedPositions:
          formData.relatedPositions.length > 0
            ? formData.relatedPositions
            : undefined,
        volunteerResponsibilities:
          formData.volunteerResponsibilities || undefined,
        timeCommitment: formData.timeCommitment || undefined,
        iconEmoji: formData.iconEmoji || undefined,
        imageUrl: formData.imageUrl || undefined,
        showInDirectory: formData.showInDirectory,
        // "" is uncapped, and so is anything that isn't a positive number —
        // the action narrows it again on the way in.
        helpCap: formData.helpCap ? Number(formData.helpCap) : null,
        helpWaitlistEnabled: formData.helpWaitlistEnabled,
      };

      try {
        if (editingEntry) {
          await updateCatalogEntry(editingEntry.id, data);
          resetForm();
          onSuccess?.();
        } else {
          const entry = await createCatalogEntry(data);
          resetForm();
          onSuccess?.({ id: entry.id, title: entry.title });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save this event."
        );
      }
    });
  };

  const togglePosition = (position: string) => {
    setFormData((prev) => ({
      ...prev,
      relatedPositions: prev.relatedPositions.includes(position)
        ? prev.relatedPositions.filter((p) => p !== position)
        : [...prev.relatedPositions, position],
    }));
  };

  // A fresh entry with unacknowledged look-alikes is the one case worth
  // stopping. Editing an existing entry never trips this.
  const blockedByDuplicate =
    !editingEntry && similar.length > 0 && !duplicateAcknowledged;

  if (!showForm && showToggleButton) {
    return (
      <Button onClick={() => setShowForm(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Recurring Event
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">
          {editingEntry ? "Edit Recurring Event" : "Add Recurring Event"}
        </h3>
        <Button variant="ghost" size="sm" onClick={resetForm}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Event Name *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, title: e.target.value }))
            }
            onBlur={checkForDuplicates}
            placeholder="e.g., Field Day, Valentine's Day Parties"
          />
          <p className="text-xs text-muted-foreground">
            Name the event itself, not one year of it — &ldquo;Field Day&rdquo;,
            not &ldquo;Field Day 2026&rdquo;. Each school year gets its own event
            plan underneath this.
          </p>
        </div>

        {similar.length > 0 && (
          <div className="sm:col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  This looks like an event you already have
                </p>
                <ul className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-300">
                  {similar.map((s) => (
                    <li key={s.id}>
                      {s.title}
                      {s.typicalMonth
                        ? ` — usually ${monthLabel(s.typicalMonth)}`
                        : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-amber-700 dark:text-amber-300">
                  To plan this year&rsquo;s, create an event plan and pick the
                  existing entry instead of adding a second one here.
                </p>
                {!editingEntry && (
                  <label className="mt-2 flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <input
                      type="checkbox"
                      checked={duplicateAcknowledged}
                      onChange={(e) =>
                        setDuplicateAcknowledged(e.target.checked)
                      }
                    />
                    This is a different event — add it anyway
                  </label>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <CategorySelect
            id="category"
            set={EVENT_CATEGORIES}
            placeholder="Select category..."
            value={formData.category}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, category: e.target.value }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="typicalMonth">Typical Month</Label>
          <select
            id="typicalMonth"
            value={formData.typicalMonth}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, typicalMonth: e.target.value }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select month...</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Top-level, not tucked into "What Parents See" below: the icon is the
            event's face everywhere it appears — this list, each year's event
            plan, and any signup page — so it isn't a volunteer-facing detail. */}
        <div className="space-y-2 sm:col-span-2">
          <IconPicker
            iconEmoji={formData.iconEmoji}
            imageUrl={formData.imageUrl}
            onChange={({ iconEmoji, imageUrl }) =>
              setFormData((prev) => ({ ...prev, iconEmoji, imageUrl }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Shows on this event everywhere it appears — including every school
            year&rsquo;s event plan filed under it.
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="timingNote">Timing Notes</Label>
          <Input
            id="timingNote"
            value={formData.timingNote}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, timingNote: e.target.value }))
            }
            placeholder="e.g., Second week, always the Friday before spring break"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="description">Description</Label>
            {/* The description is what families read on Our Events, so the
                board can see it the way they see it rather than discovering
                the difference after release. One field, previewed — a second
                "family copy" field would go stale the first week. */}
            <button
              type="button"
              onClick={() => setPreviewing((open) => !open)}
              className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
              aria-expanded={previewing}
            >
              <Eye className="h-3.5 w-3.5" />
              {previewing ? "Hide preview" : "Preview as a family"}
            </button>
          </div>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            placeholder="Brief description of what this event involves..."
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Shown to families on Our Events. Budget, tips and key tasks below
            never are.
          </p>
          {previewing && (
            <div className="rounded-lg border border-dragon-blue-200 bg-dragon-blue-50 p-3 dark:border-dragon-blue-800 dark:bg-dragon-blue-950">
              <p className="mb-2 text-xs font-medium text-dragon-blue-800 dark:text-dragon-blue-200">
                What a parent sees
              </p>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background text-xl">
                  {formData.iconEmoji || "📋"}
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {formData.title || "Untitled event"}
                  </p>
                  <p className="text-muted-foreground">
                    {[
                      monthLabel(Number(formData.typicalMonth) || null),
                      formData.timingNote,
                    ]
                      .filter(Boolean)
                      .join(" — ") || "No timing set"}
                  </p>
                  <p className="mt-2 whitespace-pre-line">
                    {formData.description || "No description yet."}
                  </p>
                  {formData.volunteerResponsibilities && (
                    <>
                      <p className="mt-2 font-medium">
                        What you&rsquo;d actually be doing
                      </p>
                      <p className="whitespace-pre-line">
                        {formData.volunteerResponsibilities}
                      </p>
                    </>
                  )}
                  {formData.timeCommitment && (
                    <p className="text-muted-foreground mt-2">
                      {formData.timeCommitment}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="estimatedBudget">Estimated Budget</Label>
          <Input
            id="estimatedBudget"
            value={formData.estimatedBudget}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                estimatedBudget: e.target.value,
              }))
            }
            placeholder="e.g., $500, $1000-2000"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="estimatedVolunteers">Estimated Volunteers</Label>
          <Input
            id="estimatedVolunteers"
            value={formData.estimatedVolunteers}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                estimatedVolunteers: e.target.value,
              }))
            }
            placeholder="e.g., 10-15 volunteers"
          />
        </div>

        {/* Prefilled onto each year's plan when the board opens the whole year
            at once, so a generated plan arrives filled in rather than empty.
            Set once here; every future year inherits them. */}
        <div className="space-y-2">
          <Label htmlFor="defaultEventType">Default Event Type</Label>
          <select
            id="defaultEventType"
            value={formData.defaultEventType}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                defaultEventType: e.target.value,
              }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select type...</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultLocation">Default Location</Label>
          <Input
            id="defaultLocation"
            value={formData.defaultLocation}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                defaultLocation: e.target.value,
              }))
            }
            placeholder="e.g., Blacktop, Cafeteria, MPR"
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="tips">Tips & Advice</Label>
          <Textarea
            id="tips"
            value={formData.tips}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, tips: e.target.value }))
            }
            placeholder="Any tips for running this event successfully..."
            rows={2}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="keyTasks">Key Tasks (one per line)</Label>
          <Textarea
            id="keyTasks"
            value={formData.keyTasks}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, keyTasks: e.target.value }))
            }
            placeholder="Book venue&#10;Order supplies&#10;Recruit volunteers"
            rows={3}
          />
        </div>

        <div className="sm:col-span-2">
          <TagPicker
            value={formData.tags}
            onChange={(tags) => setFormData((prev) => ({ ...prev, tags }))}
            available={availableTags}
            helpText="Tags are shared across DragonHub and configured in the PTA Board Hub."
          />
        </div>

        {/* Everything below is what a parent sees when deciding whether to
            volunteer. Written once here, reused by every campaign. */}
        <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="text-sm font-semibold">What Parents See</h4>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            Used whenever this event is added to a volunteer campaign, so you
            write it once instead of retyping it every recruiting push.
          </p>

          <div className="space-y-4">
            <div>
              <Label htmlFor="volunteerResponsibilities">
                What Volunteers Do
              </Label>
              <Textarea
                id="volunteerResponsibilities"
                value={formData.volunteerResponsibilities}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    volunteerResponsibilities: e.target.value,
                  }))
                }
                rows={4}
                placeholder={
                  "Set up chairs in the gym\nHelp run the craft stations\nHand out snacks\nClean up after"
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The single biggest thing parents want to know before saying yes.
              </p>
            </div>

            <div>
              <Label htmlFor="timeCommitment">Time Commitment</Label>
              <Input
                id="timeCommitment"
                value={formData.timeCommitment}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    timeCommitment: e.target.value,
                  }))
                }
                placeholder="e.g., About 2 hours"
              />
            </div>
          </div>
        </div>

        {/* Our Events — the front window. Sits with "What Parents See" because
            it answers the same question: what leaves this screen and reaches a
            family. */}
        <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="text-sm font-semibold">Our Events</h4>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            The page every family can open. Most catalog entries belong there;
            &ldquo;Board Retreat&rdquo; and &ldquo;Budget Review&rdquo; do not.
          </p>

          <div className="space-y-4">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={formData.showInDirectory}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    showInDirectory: e.target.checked,
                  }))
                }
              />
              <span>
                Show this event to families
                <span className="block text-xs text-muted-foreground">
                  Off keeps it in the catalog for the board only. A retired
                  event is hidden either way.
                </span>
              </span>
            </label>

            <div>
              <Label htmlFor="helpCap">Planning team size</Label>
              <Input
                id="helpCap"
                type="number"
                min={1}
                value={formData.helpCap}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, helpCap: e.target.value }))
                }
                placeholder="No limit"
                className="max-w-[10rem]"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                How many people this event seats. Leave blank for no limit —
                that&rsquo;s never &ldquo;full&rdquo;. Set once here; every
                year&rsquo;s plan inherits it, and a lead who needs one more can
                still add them.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={formData.helpWaitlistEnabled}
                disabled={!formData.helpCap}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    helpWaitlistEnabled: e.target.checked,
                  }))
                }
              />
              <span>
                Keep a waitlist when the team is full
                <span className="block text-xs text-muted-foreground">
                  {formData.helpCap
                    ? "On, a spot opening promotes the next person automatically and tells them. Off, a full team is a dead end and the page says so."
                    : "Only matters once there's a team size — an unlimited team is never full."}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Related Board Positions</Label>
          <div className="flex flex-wrap gap-2">
            {positions.map(({ slug: key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => togglePosition(key)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  formData.relatedPositions.includes(key)
                    ? "bg-dragon-blue-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={resetForm}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isPending || !formData.title.trim() || blockedByDuplicate}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editingEntry ? "Save Changes" : "Add Event"}
        </Button>
      </div>
    </div>
  );
}
