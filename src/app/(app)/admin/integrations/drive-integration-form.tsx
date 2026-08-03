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
  schoolYearOptions?: string[];
  /**
   * This school's own service account. Every school configures its own, so the
   * address to share with is never the same twice and must never be hard-coded
   * into help text.
   */
  serviceAccountEmail?: string | null;
}

export function DriveIntegrationForm({
  integration,
  schoolYearOptions = [],
  serviceAccountEmail,
}: DriveIntegrationFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isEdit = !!integration;

  // Ensure a previously-saved year still appears even if it has since dropped
  // out of the school's available years.
  const savedYear = integration?.schoolYear;
  const yearOptions =
    savedYear && !schoolYearOptions.includes(savedYear)
      ? [savedYear, ...schoolYearOptions]
      : schoolYearOptions;

  function handleCopyEmail() {
    if (!serviceAccountEmail) return;
    navigator.clipboard.writeText(serviceAccountEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
    } catch (err) {
      console.error("Failed to save drive integration:", err);
      // Adding a folder the service account can't read fails here, and the
      // message says which account to share it with — keep it on screen.
      setError(
        err instanceof Error ? err.message : "Failed to save this folder."
      );
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
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Share-first instructions. The folder is checked on save, so a
              folder that hasn't been shared is rejected right below this. */}
          {!isEdit && (
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
              <p className="font-medium">First, share the folder in Google Drive</p>
              {serviceAccountEmail ? (
                <>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                    <li>
                      In Google Drive, right-click the folder and choose{" "}
                      <strong>Share</strong>.
                    </li>
                    <li>
                      Paste this address, set it to <strong>Viewer</strong>, and
                      send:
                    </li>
                  </ol>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                      {serviceAccountEmail}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyEmail}
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Drive will warn that this address isn&apos;t in your contacts
                    — that&apos;s expected. Sharing attaches to the folder, not
                    to your Google account: a new folder sitting beside folders
                    that already sync still needs its own share, unless you
                    created it inside a folder you shared before.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  This school has no Google service account configured yet. Add
                  credentials at the top of this page first — DragonHub reads
                  Drive as that account, and it needs to be given access to the
                  folder.
                </p>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="folderId"
              className="mb-1 block text-sm font-medium"
            >
              Folder URL or ID
            </label>
            <input
              id="folderId"
              name="folderId"
              type="text"
              required
              disabled={isEdit}
              defaultValue={integration?.folderId ?? ""}
              placeholder="https://drive.google.com/drive/folders/1ABC123def456…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Paste the folder&apos;s full Drive URL — the ID is pulled out of it
              — or just the ID itself. Saving fails if the folder hasn&apos;t
              been shared, so you&apos;ll know straight away.
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
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
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
