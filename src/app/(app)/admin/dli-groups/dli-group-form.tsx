"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDliGroup, updateDliGroup, deleteDliGroup } from "@/actions/dli-groups";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface DliGroupFormProps {
  group?: {
    id: string;
    name: string;
    language: string | null;
    color: string | null;
    sortOrder: number | null;
    active: boolean | null;
  };
}

export function DliGroupForm({ group }: DliGroupFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEdit = !!group;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const language = formData.get("language") as string;
    const color = formData.get("color") as string;
    const sortOrder = parseInt(formData.get("sortOrder") as string) || 0;

    try {
      if (isEdit) {
        await updateDliGroup(group.id, {
          name,
          language: language || undefined,
          color: color || undefined,
          sortOrder,
        });
      } else {
        await createDliGroup({
          name,
          language: language || undefined,
          color: color || undefined,
          sortOrder,
        });
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to save DLI group:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!group) return;
    if (!confirm("Are you sure you want to deactivate this DLI group?")) return;

    setDeleting(true);
    try {
      await deleteDliGroup(group.id);
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete DLI group:", error);
    } finally {
      setDeleting(false);
    }
  }

  async function handleReactivate() {
    if (!group) return;
    setLoading(true);
    try {
      await updateDliGroup(group.id, { active: true });
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to reactivate DLI group:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "Create DLI Group"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit DLI Group" : "Create DLI Group"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder='e.g., "Red - Chinese Homeroom"'
              defaultValue={group?.name ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="language" className="mb-1 block text-sm font-medium">
              Language
            </label>
            <input
              id="language"
              name="language"
              type="text"
              placeholder='e.g., "Chinese", "Spanish"'
              defaultValue={group?.language ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="color" className="mb-1 block text-sm font-medium">
              Color
            </label>
            <div className="flex gap-2">
              <input
                id="color"
                name="color"
                type="color"
                defaultValue={group?.color ?? "#3b82f6"}
                className="h-10 w-14 cursor-pointer rounded border border-input"
              />
              <input
                type="text"
                value={group?.color ?? ""}
                readOnly
                placeholder="Select a color"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional color for visual distinction in the UI
            </p>
          </div>
          <div>
            <label htmlFor="sortOrder" className="mb-1 block text-sm font-medium">
              Sort Order
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min="0"
              defaultValue={group?.sortOrder ?? 0}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Lower numbers appear first in dropdown lists
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {isEdit && group?.active === false && (
              <Button
                type="button"
                variant="outline"
                onClick={handleReactivate}
                disabled={loading}
                className="sm:mr-auto"
              >
                Reactivate
              </Button>
            )}
            {isEdit && group?.active !== false && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting || loading}
                className="sm:mr-auto"
              >
                {deleting ? "Deactivating..." : "Deactivate"}
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
