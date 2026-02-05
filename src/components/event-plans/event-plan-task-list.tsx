"use client";

import { useState } from "react";
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

interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  dueDate: string | null;
  assignee: { name: string } | null;
}

interface EventPlanTaskListProps {
  eventPlanId: string;
  tasks: Task[];
  canCreate: boolean;
  canDelete: boolean;
  members: { userId: string; userName: string }[];
}

export function EventPlanTaskList({
  eventPlanId,
  tasks,
  canCreate,
  canDelete,
  members,
}: EventPlanTaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const completedCount = tasks.filter((t) => t.completed).length;
  const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {tasks.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedCount} of {tasks.length} tasks completed
            </span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      {canCreate && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add Task
          </Button>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No tasks yet. Add tasks to plan this event.
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <EventPlanTaskItem
              key={task.id}
              task={task}
              canDelete={canDelete}
            />
          ))}
        </div>
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
