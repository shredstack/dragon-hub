"use client";

import { useState, useCallback } from "react";
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
import { Plus } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { reorderEventPlanTasks } from "@/actions/event-plans";
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
  assignee: { name: string } | null;
}

interface EventPlanTaskListProps {
  eventPlanId: string;
  tasks: Task[];
  canCreate: boolean;
  canDelete: boolean;
  canEdit: boolean;
  members: { userId: string; userName: string }[];
}

export function EventPlanTaskList({
  eventPlanId,
  tasks,
  canCreate,
  canDelete,
  canEdit,
  members,
}: EventPlanTaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<TaskTimingTag | "all">("all");
  const [orderedTasks, setOrderedTasks] = useState(tasks);

  // Update orderedTasks when tasks prop changes
  if (JSON.stringify(tasks.map((t) => t.id)) !== JSON.stringify(orderedTasks.map((t) => t.id))) {
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

  return (
    <div className="space-y-4">
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
