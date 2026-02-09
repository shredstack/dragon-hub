"use client";

import { useState } from "react";
import { addEventPlanResource, removeEventPlanResource } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ExternalLink, Trash2, FileText, Info, Copy, Check } from "lucide-react";

interface Resource {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  addedByName: string | null;
}

interface EventPlanResourcesProps {
  eventPlanId: string;
  resources: Resource[];
  canAdd: boolean;
  canRemove: boolean;
  serviceAccountEmail?: string | null;
}

export function EventPlanResources({
  eventPlanId,
  resources,
  canAdd,
  canRemove,
  serviceAccountEmail,
}: EventPlanResourcesProps) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopyEmail() {
    if (!serviceAccountEmail) return;
    await navigator.clipboard.writeText(serviceAccountEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    await addEventPlanResource(eventPlanId, {
      title: formData.get("title") as string,
      url: (formData.get("url") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    });
    setLoading(false);
    setShowForm(false);
  }

  return (
    <div className="space-y-4">
      {serviceAccountEmail && (
        <button
          type="button"
          onClick={handleCopyEmail}
          className="flex w-full items-start gap-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 text-left text-sm transition-colors hover:bg-blue-100/50 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="flex-1">
            <p className="font-medium text-blue-700 dark:text-blue-300">
              Adding a personal Google Drive file?
            </p>
            <p className="text-blue-600 dark:text-blue-400">
              Share it with:{" "}
              <code className="rounded bg-blue-100 px-1 dark:bg-blue-800">
                {serviceAccountEmail}
              </code>
            </p>
          </div>
          {copied ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <Copy className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          )}
        </button>
      )}

      {canAdd && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add Resource
          </Button>
        </div>
      )}

      {resources.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No resources yet. Add documents, links, or references for planning.
        </p>
      ) : (
        <div className="space-y-2">
          {resources.map((resource) => (
            <div
              key={resource.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{resource.title}</p>
                    {resource.url && (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  {resource.notes && (
                    <p className="text-xs text-muted-foreground">
                      {resource.notes}
                    </p>
                  )}
                  {resource.addedByName && (
                    <p className="text-xs text-muted-foreground">
                      Added by {resource.addedByName}
                    </p>
                  )}
                </div>
              </div>
              {canRemove && (
                <button
                  onClick={() => removeEventPlanResource(resource.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Resource</DialogTitle>
          </DialogHeader>
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
              <label className="mb-1 block text-sm font-medium">
                URL (optional)
              </label>
              <input
                name="url"
                type="url"
                placeholder="https://..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Notes (optional)
              </label>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Adding..." : "Add Resource"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
