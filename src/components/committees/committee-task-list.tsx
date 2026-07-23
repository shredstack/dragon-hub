"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCommitteeTask,
  deleteCommitteeTask,
  updateCommitteeTaskStatus,
} from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

export interface CommitteeTask {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { name: string } | null;
}

interface Props {
  committeeId: string;
  tasks: CommitteeTask[];
  /** Only accounts, not signups — a task can't be assigned to someone with no login. */
  members: Array<{ userId: string; name: string }>;
  canManage: boolean;
}

export function CommitteeTaskList({
  committeeId,
  tasks,
  members,
  canManage,
}: Props) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    assignedTo: "",
  });

  const handleCreate = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await createCommitteeTask(committeeId, {
        title: form.title,
        description: form.description || undefined,
        dueDate: form.dueDate || undefined,
        assignedTo: form.assignedTo || undefined,
      });
      setForm({ title: "", description: "", dueDate: "", assignedTo: "" });
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the task.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (task: CommitteeTask, completed: boolean) => {
    await updateCommitteeTaskStatus(task.id, completed);
    router.refresh();
  };

  const handleDelete = async (task: CommitteeTask) => {
    const ok = await confirm({
      title: `Delete "${task.title}"?`,
      description: "This removes it from the committee's task list for everyone.",
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    await deleteCommitteeTask(task.id);
    router.refresh();
  };

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> Add task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No tasks yet. Add the first thing that needs doing.
        </p>
      ) : (
        <>
          {open.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              canManage={canManage}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
          {done.length > 0 && (
            <details className="pt-2">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {done.length} completed
              </summary>
              <div className="mt-2 space-y-2">
                {done.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    canManage={canManage}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a task</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Task *</Label>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Collect class photos from teachers"
              />
            </div>
            <div>
              <Label htmlFor="task-description">Details</Label>
              <Textarea
                id="task-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="task-assignee">Assign to</Label>
                <select
                  id="task-assignee"
                  value={form.assignedTo}
                  onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Nobody yet</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving || !form.title.trim()}>
              {isSaving ? "Adding…" : "Add task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}

function TaskRow({
  task,
  canManage,
  onToggle,
  onDelete,
}: {
  task: CommitteeTask;
  canManage: boolean;
  onToggle: (task: CommitteeTask, completed: boolean) => void;
  onDelete: (task: CommitteeTask) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={(e) => onToggle(task, e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-border"
      />
      <div className="min-w-0 flex-1">
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
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {task.assignee && (
            <Badge variant="secondary">{task.assignee.name}</Badge>
          )}
          {task.dueDate && (
            <span className="text-xs text-muted-foreground">
              Due {formatDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>
      {canManage && (
        <Button size="sm" variant="ghost" onClick={() => onDelete(task)}>
          Delete
        </Button>
      )}
    </div>
  );
}
