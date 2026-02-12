"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, X } from "lucide-react";
import {
  createCatalogEntry,
  updateCatalogEntry,
} from "@/actions/event-catalog";
import type { EventCatalogEntry } from "@/types";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";

interface EventCatalogFormProps {
  editingEntry?: EventCatalogEntry;
  onSuccess?: () => void;
  onCancel?: () => void;
  showToggleButton?: boolean;
}

export function EventCatalogForm({
  editingEntry,
  onSuccess,
  onCancel,
  showToggleButton = true,
}: EventCatalogFormProps) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(!showToggleButton || !!editingEntry);

  const [formData, setFormData] = useState({
    eventType: editingEntry?.eventType ?? "",
    title: editingEntry?.title ?? "",
    description: editingEntry?.description ?? "",
    typicalTiming: editingEntry?.typicalTiming ?? "",
    estimatedVolunteers: editingEntry?.estimatedVolunteers ?? "",
    estimatedBudget: editingEntry?.estimatedBudget ?? "",
    keyTasks: editingEntry?.keyTasks
      ? JSON.parse(editingEntry.keyTasks).join("\n")
      : "",
    tips: editingEntry?.tips ?? "",
    relatedPositions: editingEntry?.relatedPositions ?? ([] as string[]),
  });

  const resetForm = () => {
    setFormData({
      eventType: "",
      title: "",
      description: "",
      typicalTiming: "",
      estimatedVolunteers: "",
      estimatedBudget: "",
      keyTasks: "",
      tips: "",
      relatedPositions: [],
    });
    setShowForm(false);
    onCancel?.();
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const data = {
        ...formData,
        keyTasks: formData.keyTasks || undefined,
        tips: formData.tips || undefined,
        relatedPositions:
          formData.relatedPositions.length > 0
            ? formData.relatedPositions
            : undefined,
      };

      if (editingEntry) {
        await updateCatalogEntry(editingEntry.id, data);
      } else {
        await createCatalogEntry(data);
      }
      resetForm();
      onSuccess?.();
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

  if (!showForm && showToggleButton) {
    return (
      <Button onClick={() => setShowForm(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Event Manually
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">
          {editingEntry ? "Edit Event" : "Add New Event"}
        </h3>
        <Button variant="ghost" size="sm" onClick={resetForm}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="eventType">Event Type *</Label>
          <Input
            id="eventType"
            value={formData.eventType}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, eventType: e.target.value }))
            }
            placeholder="e.g., fundraiser, social, meeting"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="e.g., Fall Carnival"
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
          <Label htmlFor="typicalTiming">Typical Timing</Label>
          <Input
            id="typicalTiming"
            value={formData.typicalTiming}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                typicalTiming: e.target.value,
              }))
            }
            placeholder="e.g., October, Spring semester"
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

        <div className="space-y-2">
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

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={resetForm}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isPending || !formData.eventType || !formData.title}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editingEntry ? "Save Changes" : "Add Event"}
        </Button>
      </div>
    </div>
  );
}
