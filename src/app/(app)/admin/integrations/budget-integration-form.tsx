"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveBudgetIntegration,
  deleteBudgetIntegration,
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

interface BudgetIntegrationFormProps {
  existingIntegration?: {
    id: string;
    sheetId: string;
    name: string | null;
  } | null;
}

export function BudgetIntegrationForm({
  existingIntegration,
}: BudgetIntegrationFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isConfigured = !!existingIntegration;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const sheetId = formData.get("sheetId") as string;
    const name = formData.get("name") as string;

    try {
      await saveBudgetIntegration({
        sheetId,
        name: name || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteBudgetIntegration();
      setDeleteConfirm(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={isConfigured ? "sm" : "default"}>
          {isConfigured ? "Edit" : "Configure Budget Sheet"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isConfigured
              ? "Edit Budget Sheet"
              : "Configure Budget Google Sheet"}
          </DialogTitle>
        </DialogHeader>

        {deleteConfirm ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove the budget sheet integration?
              Budget data will no longer sync from Google Sheets.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? "Removing..." : "Remove"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="sheetId"
                className="mb-1 block text-sm font-medium"
              >
                Google Sheet ID
              </label>
              <input
                id="sheetId"
                name="sheetId"
                type="text"
                required
                defaultValue={existingIntegration?.sheetId ?? ""}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The ID from the Google Sheet URL (between /d/ and /edit)
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
                defaultValue={existingIntegration?.name ?? ""}
                placeholder="PTA Budget 2024-25"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              {isConfigured && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteConfirm(true)}
                  className="sm:mr-auto"
                >
                  Remove
                </Button>
              )}
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
