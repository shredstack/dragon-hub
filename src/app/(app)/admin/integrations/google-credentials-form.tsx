"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveGoogleIntegration,
  deleteGoogleIntegration,
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
import { Badge } from "@/components/ui/badge";

interface GoogleCredentialsFormProps {
  existingIntegration?: {
    id: string;
    serviceAccountEmail: string;
    privateKeyConfigured: boolean;
    active: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  } | null;
}

export function GoogleCredentialsForm({
  existingIntegration,
}: GoogleCredentialsFormProps) {
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
    const serviceAccountEmail = formData.get("serviceAccountEmail") as string;
    const privateKey = formData.get("privateKey") as string;

    try {
      await saveGoogleIntegration({
        serviceAccountEmail,
        privateKey,
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
      await deleteGoogleIntegration();
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
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Google Service Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your Google service account credentials to enable Calendar
            and Drive integrations.
          </p>
        </div>
        {isConfigured && (
          <Badge variant={existingIntegration.active ? "default" : "secondary"}>
            {existingIntegration.active ? "Active" : "Inactive"}
          </Badge>
        )}
      </div>

      {isConfigured ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">Service Account</p>
            <p className="font-mono text-sm">
              {existingIntegration.serviceAccountEmail}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">Private Key</p>
            <p className="text-sm text-green-600">Configured</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Google credentials are required for Calendar and Drive integrations
            to work. Please configure them below.
          </p>
        </div>
      )}

      <div className="mt-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>{isConfigured ? "Update Credentials" : "Configure"}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {isConfigured
                  ? "Update Google Credentials"
                  : "Configure Google Credentials"}
              </DialogTitle>
            </DialogHeader>

            {deleteConfirm ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete the Google credentials? This
                  will disable all Google integrations (Calendar, Drive, Budget)
                  for your school.
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
                    {loading ? "Deleting..." : "Delete Credentials"}
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
                    htmlFor="serviceAccountEmail"
                    className="mb-1 block text-sm font-medium"
                  >
                    Service Account Email
                  </label>
                  <input
                    id="serviceAccountEmail"
                    name="serviceAccountEmail"
                    type="email"
                    required
                    defaultValue={existingIntegration?.serviceAccountEmail ?? ""}
                    placeholder="your-service-account@project.iam.gserviceaccount.com"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    The email address of your Google Cloud service account
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="privateKey"
                    className="mb-1 block text-sm font-medium"
                  >
                    Private Key
                  </label>
                  <textarea
                    id="privateKey"
                    name="privateKey"
                    required
                    rows={6}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    The private key from your service account JSON file. Include
                    the BEGIN and END markers.
                  </p>
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  {isConfigured && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setDeleteConfirm(true)}
                      className="sm:mr-auto"
                    >
                      Delete
                    </Button>
                  )}
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save Credentials"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
