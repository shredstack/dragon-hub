"use client";

import { updateTaskStatus } from "@/actions/classrooms";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TaskItemProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    completed: boolean;
    dueDate: string | null;
    assignee: { name: string } | null;
  };
  classroomId: string;
}

export function TaskItem({ task }: TaskItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={(e) => updateTaskStatus(task.id, e.target.checked)}
        className="h-4 w-4 rounded border-border"
      />
      <div className="flex-1">
        <p className={task.completed ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>
          {task.title}
        </p>
        {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
      </div>
      {task.assignee && <Badge variant="secondary">{task.assignee.name}</Badge>}
      {task.dueDate && (
        <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>
      )}
    </div>
  );
}
