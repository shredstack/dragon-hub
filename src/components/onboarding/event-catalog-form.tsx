"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagPicker } from "@/components/ui/tag-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { Plus, Loader2, X, AlertTriangle } from "lucide-react";
import {
  createCatalogEntry,
  updateCatalogEntry,
  findSimilarCatalogEntries,
} from "@/actions/event-catalog";
import type { EventCatalogEntry } from "@/types";
import {
  PTA_BOARD_POSITIONS,
  EVENT_CATEGORIES,
  MONTHS,
  monthLabel,
} from "@/lib/constants";

interface EventCatalogFormProps {
  editingEntry?: EventCatalogEntry;
  availableTags?: { name: string; displayName: string }[];
  onSuccess?: () => void;
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

  const [formData, setFormData] = useState({
    title: editingEntry?.title ?? "",
    category: editingEntry?.category ?? "",
    description: editingEntry?.description ?? "",
    typicalMonth: editingEntry?.typicalMonth?.toString() ?? "",
    timingNote: editingEntry?.timingNote ?? "",
    estimatedVolunteers: editingEntry?.estimatedVolunteers ?? "",
    estimatedBudget: editingEntry?.estimatedBudget ?? "",
    keyTasks: editingEntry?.keyTasks
      ? JSON.parse(editingEntry.keyTasks).join("\n")
      : "",
    tips: editingEntry?.tips ?? "",
    tags: editingEntry?.tags ?? ([] as string[]),
    relatedPositions: editingEntry?.relatedPositions ?? ([] as string[]),
    volunteerResponsibilities: editingEntry?.volunteerResponsibilities ?? "",
    timeCommitment: editingEntry?.timeCommitment ?? "",
    iconEmoji: editingEntry?.iconEmoji ?? "",
    imageUrl: editingEntry?.imageUrl ?? "",
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
      keyTasks: "",
      tips: "",
      tags: [],
      relatedPositions: [],
      volunteerResponsibilities: "",
      timeCommitment: "",
      iconEmoji: "",
      imageUrl: "",
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
        keyTasks: formData.keyTasks || undefined,
        tips: formData.tips || undefined,
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
      };

      try {
        if (editingEntry) {
          await updateCatalogEntry(editingEntry.id, data);
        } else {
          await createCatalogEntry(data);
        }
        resetForm();
        onSuccess?.();
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
          <select
            id="category"
            value={formData.category}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, category: e.target.value }))
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select category...</option>
            {Object.entries(EVENT_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
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
          <Label htmlFor="description">Description</Label>
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
            <IconPicker
              iconEmoji={formData.iconEmoji}
              imageUrl={formData.imageUrl}
              onChange={({ iconEmoji, imageUrl }) =>
                setFormData((prev) => ({ ...prev, iconEmoji, imageUrl }))
              }
            />

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

        <div className="space-y-2 sm:col-span-2">
          <Label>Related Board Positions</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PTA_BOARD_POSITIONS).map(([key, label]) => (
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
