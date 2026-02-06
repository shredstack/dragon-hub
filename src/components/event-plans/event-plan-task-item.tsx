"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  toggleEventPlanTask,
  deleteEventPlanTask,
  updateEventPlanTask,
} from "@/actions/event-plans";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TASK_TIMING_TAGS } from "@/lib/constants";
import { Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import type { TaskTimingTag } from "@/types";

interface EventPlanTaskItemProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    dueDate: string | null;
    timingTag: TaskTimingTag | null;
    assignee: { name: string } | null;
  };
  canDelete: boolean;
  canEdit: boolean;
  isDraggable?: boolean;
}

const timingTagVariants: Record<TaskTimingTag, "destructive" | "warning" | "success"> = {
  day_of: "destructive",
  days_before: "warning",
  week_plus_before: "success",
};

export function EventPlanTaskItem({
  task,
  canDelete,
  canEdit,
  isDraggable = true,
}: EventPlanTaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || "");
  const [editTimingTag, setEditTimingTag] = useState<TaskTimingTag | "">(
    task.timingTag || ""
  );
  const [saving, setSaving] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !isDraggable || isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  async function handleSave() {
    setSaving(true);
    await updateEventPlanTask(task.id, {
      title: editTitle,
      description: editDescription || undefined,
      timingTag: editTimingTag || null,
    });
    setSaving(false);
    setIsEditing(false);
  }

  function handleCancel() {
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditTimingTag(task.timingTag || "");
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="space-y-2 rounded-md border border-primary bg-card p-3"
      >
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium"
          autoFocus
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          <select
            value={editTimingTag}
            onChange={(e) => setEditTimingTag(e.target.value as TaskTimingTag | "")}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="">No timing</option>
            {Object.entries(TASK_TIMING_TAGS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <button
              onClick={handleCancel}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              disabled={saving}
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={handleSave}
              className="rounded p-1 text-primary hover:bg-primary/10"
              disabled={saving || !editTitle.trim()}
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3 sm:gap-3"
    >
      {isDraggable && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => toggleEventPlanTask(task.id)}
        className="h-4 w-4 rounded border-border"
      />
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <p
          className={
            task.completed
              ? "text-sm text-muted-foreground line-through"
              : "text-sm font-medium"
          }
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground">{task.description}</p>
        )}
      </div>
      {task.timingTag && (
        <Badge variant={timingTagVariants[task.timingTag]}>
          {TASK_TIMING_TAGS[task.timingTag]}
        </Badge>
      )}
      {task.assignee && (
        <Badge variant="secondary">{task.assignee.name}</Badge>
      )}
      {task.dueDate && (
        <span className="text-xs text-muted-foreground">
          {formatDate(task.dueDate)}
        </span>
      )}
      {canEdit && (
        <button
          onClick={() => setIsEditing(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && (
        <button
          onClick={() => deleteEventPlanTask(task.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
