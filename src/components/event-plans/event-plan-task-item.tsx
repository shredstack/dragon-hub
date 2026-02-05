"use client";

import { toggleEventPlanTask, deleteEventPlanTask } from "@/actions/event-plans";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

interface EventPlanTaskItemProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    dueDate: string | null;
    assignee: { name: string } | null;
  };
  canDelete: boolean;
}

export function EventPlanTaskItem({ task, canDelete }: EventPlanTaskItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => toggleEventPlanTask(task.id)}
        className="h-4 w-4 rounded border-border"
      />
      <div className="flex-1">
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
      {task.assignee && (
        <Badge variant="secondary">{task.assignee.name}</Badge>
      )}
      {task.dueDate && (
        <span className="text-xs text-muted-foreground">
          {formatDate(task.dueDate)}
        </span>
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
