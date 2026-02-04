"use client";

import { useState } from "react";
import { TaskItem } from "./task-item";
import { TaskForm } from "./task-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  dueDate: string | null;
  assignee: { name: string } | null;
  creator: { name: string } | null;
}

interface TaskListProps {
  classroomId: string;
  tasks: Task[];
  canCreateTask: boolean;
  classroomMembers: { userId: string; userName: string }[];
}

export function TaskList({ classroomId, tasks, canCreateTask, classroomMembers }: TaskListProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-3">
      {canCreateTask && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add Task
          </Button>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        tasks.map((task) => (
          <TaskItem key={task.id} task={task} classroomId={classroomId} />
        ))
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <TaskForm classroomId={classroomId} members={classroomMembers} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
