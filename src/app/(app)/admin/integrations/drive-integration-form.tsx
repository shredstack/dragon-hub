"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDriveIntegration,
  updateDriveIntegration,
} from "@/actions/integrations";
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

interface DriveIntegrationFormProps {
  integration?: {
    id: string;
    folderId: string;
    name: string | null;
    folderType: "general" | "minutes" | null;
  };
}

export function DriveIntegrationForm({
  integration,
}: DriveIntegrationFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isEdit = !!integration;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const folderId = formData.get("folderId") as string;
    const name = formData.get("name") as string;
    const folderType = formData.get("folderType") as "general" | "minutes";

    try {
      if (isEdit) {
        await updateDriveIntegration(integration.id, {
          name: name || undefined,
          folderType,
        });
      } else {
        await addDriveIntegration({
          folderId,
          name: name || undefined,
          folderType,
        });
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to save drive integration:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "Add Folder"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Folder" : "Add Google Drive Folder"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="folderId"
              className="mb-1 block text-sm font-medium"
            >
              Folder ID
            </label>
            <input
              id="folderId"
              name="folderId"
              type="text"
              required
              disabled={isEdit}
              defaultValue={integration?.folderId ?? ""}
              placeholder="1ABC123def456..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Find this in the Google Drive folder URL after /folders/
            </p>
          </div>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Display Name (optional)
            </label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={integration?.name ?? ""}
              placeholder="PTA Documents"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label
              htmlFor="folderType"
              className="mb-1 block text-sm font-medium"
            >
              Folder Type
            </label>
            <select
              id="folderType"
              name="folderType"
              defaultValue={integration?.folderType ?? "general"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="general">General Documents</option>
              <option value="minutes">PTA Meeting Minutes</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Minutes folders are synced automatically and made available for
              approval workflow
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
