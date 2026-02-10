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
    maxDepth: number | null;
    schoolYear: string | null;
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
    const maxDepth = parseInt(formData.get("maxDepth") as string, 10);
    const schoolYear = formData.get("schoolYear") as string;

    try {
      if (isEdit) {
        await updateDriveIntegration(integration.id, {
          name: name || undefined,
          folderType,
          maxDepth,
          schoolYear: schoolYear || null,
        });
      } else {
        await addDriveIntegration({
          folderId,
          name: name || undefined,
          folderType,
          maxDepth,
          schoolYear: schoolYear || undefined,
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
          <div>
            <label
              htmlFor="maxDepth"
              className="mb-1 block text-sm font-medium"
            >
              Subfolder Depth
            </label>
            <select
              id="maxDepth"
              name="maxDepth"
              defaultValue={integration?.maxDepth ?? 5}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="0">This folder only (no subfolders)</option>
              <option value="1">1 level deep</option>
              <option value="2">2 levels deep</option>
              <option value="3">3 levels deep</option>
              <option value="4">4 levels deep</option>
              <option value="5">5 levels deep (default)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              How many levels of subfolders to index
            </p>
          </div>
          <div>
            <label
              htmlFor="schoolYear"
              className="mb-1 block text-sm font-medium"
            >
              School Year (optional)
            </label>
            <select
              id="schoolYear"
              name="schoolYear"
              defaultValue={integration?.schoolYear ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Any / Not Specified</option>
              <option value="2025-2026">2025-2026</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2023-2024">2023-2024</option>
              <option value="2022-2023">2022-2023</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Tag documents from this folder with a school year for AI recommendations
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
