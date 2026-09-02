"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { EventPlanTaskItem } from "./event-plan-task-item";
import { EventPlanTaskForm } from "./event-plan-task-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Repeat } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useToast } from "@/components/ui/toast";
import {
  importCatalogKeyTasks,
  reorderEventPlanTasks,
} from "@/actions/event-plans";
import { TASK_TIMING_TAGS } from "@/lib/constants";
import type { TaskTimingTag } from "@/types";

interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  dueDate: string | null;
  timingTag: TaskTimingTag | null;
  sortOrder: number;
  assignedTo: string | null;
  assignee: { name: string; pending: boolean } | null;
}

// A person a task can be handed to: an existing member (value = user id) or
// someone still invited (value = `invite:<id>`, pending = true).
export interface TaskAssigneeOption {
  value: string;
  label: string;
  pending: boolean;
}

interface EventPlanTaskListProps {
  eventPlanId: string;
  tasks: Task[];
  canCreate: boolean;
  canDelete: boolean;
  canEdit: boolean;
  members: TaskAssigneeOption[];
  /**
   * Key tasks on the recurring event that this plan hasn't got.
   *
   * Key tasks are copied onto a plan when it's created, so anything added to
   * the recurring event afterwards never arrives on its own. Re-syncing behind
   * the board's back would resurrect a task a lead deliberately deleted, so the
   * difference is shown and taking it is a click. See
   * src/lib/event-plan-seed.ts.
   */
  missingCatalogTasks?: string[];
  /** Named in the offer, so it's obvious where these came from. */
  catalogTitle?: string | null;
}

export function EventPlanTaskList({
  eventPlanId,
  tasks,
  canCreate,
  canDelete,
  canEdit,
  members,
  missingCatalogTasks = [],
  catalogTitle,
}: EventPlanTaskListProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [importing, startImporting] = useTransition();
  // Dismissal is per-visit, deliberately: "not these ones, not now" is a
  // decision about this sitting, and persisting it would need a column whose
  // only job is to remember a banner.
  const [dismissedImport, setDismissedImport] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<TaskTimingTag | "all">("all");
  const [orderedTasks, setOrderedTasks] = useState(tasks);

  // Update orderedTasks when tasks prop changes (IDs or data)
  const tasksKey = JSON.stringify(tasks.map((t) => ({ id: t.id, completed: t.completed, title: t.title, description: t.description, timingTag: t.timingTag, dueDate: t.dueDate, assignedTo: t.assignedTo })));
  const orderedKey = JSON.stringify(orderedTasks.map((t) => ({ id: t.id, completed: t.completed, title: t.title, description: t.description, timingTag: t.timingTag, dueDate: t.dueDate, assignedTo: t.assignedTo })));
  if (tasksKey !== orderedKey) {
    setOrderedTasks(tasks);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = orderedTasks.findIndex((t) => t.id === active.id);
        const newIndex = orderedTasks.findIndex((t) => t.id === over.id);

        const newOrder = arrayMove(orderedTasks, oldIndex, newIndex);
        setOrderedTasks(newOrder);

        // Persist the new order
        await reorderEventPlanTasks(
          eventPlanId,
          newOrder.map((t) => t.id)
        );
      }
    },
    [eventPlanId, orderedTasks]
  );

  const completedCount = orderedTasks.filter((t) => t.completed).length;
  const progress =
    orderedTasks.length > 0 ? (completedCount / orderedTasks.length) * 100 : 0;

  const filteredTasks =
    filter === "all"
      ? orderedTasks
      : orderedTasks.filter((t) => t.timingTag === filter);

  const showImportOffer =
    canCreate && !dismissedImport && missingCatalogTasks.length > 0;

  function handleImport() {
    startImporting(async () => {
      try {
        const { added } = await importCatalogKeyTasks(eventPlanId);
        addToast(
          added === 1
            ? "1 key task added to this plan."
            : `${added} key tasks added to this plan.`,
          "success"
        );
        setDismissedImport(true);
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error
            ? error.message
            : "Couldn't add those tasks.",
          "destructive"
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      {showImportOffer && (
        <div className="rounded-lg border border-dragon-blue-200 bg-dragon-blue-50 p-4 dark:border-dragon-blue-800 dark:bg-dragon-blue-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-dragon-blue-900 dark:text-dragon-blue-100">
                <Repeat className="h-4 w-4 shrink-0" />
                {missingCatalogTasks.length} key task
                {missingCatalogTasks.length === 1 ? "" : "s"} from{" "}
                {catalogTitle ?? "the recurring event"}{" "}
                {missingCatalogTasks.length === 1 ? "isn't" : "aren't"} on this
                plan
              </p>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-dragon-blue-800 dark:text-dragon-blue-200">
                {missingCatalogTasks.slice(0, 6).map((title) => (
                  <li key={title}>{title}</li>
                ))}
                {missingCatalogTasks.length > 6 && (
                  <li>and {missingCatalogTasks.length - 6} more…</li>
                )}
              </ul>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                Add them
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissedImport(true)}
              >
                Not these
              </Button>
            </div>
          </div>
        </div>
      )}

      {orderedTasks.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedCount} of {orderedTasks.length} tasks completed
            </span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Filter:</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as TaskTimingTag | "all")}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="all">All Tasks</option>
            {Object.entries(TASK_TIMING_TAGS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add Task
          </Button>
        )}
      </div>

      {orderedTasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No tasks yet. Add tasks to plan this event.
        </p>
      ) : filteredTasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No tasks match the selected filter.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <EventPlanTaskItem
                  key={task.id}
                  task={task}
                  members={members}
                  canDelete={canDelete}
                  canEdit={canEdit}
                  isDraggable={filter === "all" && canEdit}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <EventPlanTaskForm
            eventPlanId={eventPlanId}
            members={members}
            onClose={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
