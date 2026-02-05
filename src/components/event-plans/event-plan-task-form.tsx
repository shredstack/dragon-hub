"use client";

import { useState } from "react";
import { createEventPlanTask } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";

interface EventPlanTaskFormProps {
  eventPlanId: string;
  members: { userId: string; userName: string }[];
  onClose: () => void;
}

export function EventPlanTaskForm({
  eventPlanId,
  members,
  onClose,
}: EventPlanTaskFormProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    await createEventPlanTask(eventPlanId, {
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || undefined,
      dueDate: (formData.get("dueDate") as string) || undefined,
      assignedTo: (formData.get("assignedTo") as string) || undefined,
    });

    setLoading(false);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Title</label>
        <input
          name="title"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Description</label>
        <textarea
          name="description"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Due Date</label>
        <input
          name="dueDate"
          type="date"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Assign To</label>
        <select
          name="assignedTo"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userName}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Task"}
        </Button>
      </div>
    </form>
  );
}
