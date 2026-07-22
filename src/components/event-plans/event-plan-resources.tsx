"use client";

import { useState } from "react";
import {
  addEventPlanResource,
  removeEventPlanResource,
} from "@/actions/event-plans";
import { addDriveLinkDocument } from "@/actions/documents";
import {
  DocumentUploadFields,
  uploadDocument,
} from "@/components/documents/document-upload-fields";
import { formatFileSize, fileTypeLabel } from "@/lib/documents/display";
import { EventContactsPanel } from "@/components/contacts/event-contacts-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteIconButton, useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  ExternalLink,
  Trash2,
  FileText,
  Info,
  Copy,
  Check,
  Link2,
  Upload,
  Loader2,
  Sparkles,
} from "lucide-react";

interface Resource {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  addedByName: string | null;
  documentId?: string | null;
  documentSource?: string | null;
  documentFileName?: string | null;
  documentMimeType?: string | null;
  documentFileSize?: number | null;
  documentStatus?: string | null;
}

interface EventPlanResourcesProps {
  eventPlanId: string;
  resources: Resource[];
  canAdd: boolean;
  canRemove: boolean;
  serviceAccountEmail?: string | null;
  /** False for one-off plans — nothing to promote a contact into. */
  hasCatalogEntry?: boolean;
}

type Mode = "upload" | "drive" | "link";

const MODES: Array<{ value: Mode; label: string; icon: typeof Upload }> = [
  { value: "upload", label: "Upload file", icon: Upload },
  { value: "drive", label: "Google Drive", icon: FileText },
  { value: "link", label: "Web link", icon: Link2 },
];

export function EventPlanResources({
  eventPlanId,
  resources,
  canAdd,
  canRemove,
  serviceAccountEmail,
  hasCatalogEntry = false,
}: EventPlanResourcesProps) {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopyEmail() {
    if (!serviceAccountEmail) return;
    await navigator.clipboard.writeText(serviceAccountEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetForm() {
    setShowForm(false);
    setFile(null);
    setError(null);
    setMode("upload");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const title = ((formData.get("title") as string) || "").trim();
    const notes = ((formData.get("notes") as string) || "").trim();
    const url = ((formData.get("url") as string) || "").trim();

    setLoading(true);
    try {
      if (mode === "upload") {
        if (!file) {
          setError("Choose a file to upload.");
          return;
        }
        const doc = await uploadDocument(file, {
          title: title || undefined,
          description: notes || undefined,
          eventPlanId,
        });
        await addEventPlanResource(eventPlanId, {
          documentId: doc.id,
          title: title || doc.fileName,
          notes: notes || undefined,
        });
      } else if (mode === "drive") {
        const doc = await addDriveLinkDocument({
          url,
          title: title || undefined,
          description: notes || undefined,
          eventPlanId,
        });
        await addEventPlanResource(eventPlanId, {
          documentId: doc.id,
          title: title || doc.fileName,
          notes: notes || undefined,
        });
      } else {
        if (!title) {
          setError("Give the link a title.");
          return;
        }
        await addEventPlanResource(eventPlanId, {
          title,
          url: url || undefined,
          notes: notes || undefined,
        });
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          Uploaded documents are indexed and searchable, so next year&apos;s
          planners — and the AI recommendations on this page — can draw on
          them.
        </p>
      </div>

      {serviceAccountEmail && (
        <button
          type="button"
          onClick={handleCopyEmail}
          className="flex w-full items-start gap-2 rounded-md border border-blue-200 bg-blue-50/50 p-3 text-left text-sm transition-colors hover:bg-blue-100/50 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              Adding a personal Google Drive file?
            </p>
            <p className="text-muted-foreground">
              Share it with:{" "}
              <code className="rounded bg-muted px-1 text-foreground">
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
          No resources yet. Upload documents or add links for planning.
        </p>
      ) : (
        <div className="space-y-2">
          {resources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              canRemove={canRemove}
            />
          ))}
        </div>
      )}

      {/* Contacts live alongside resources: same question ("what do I need to
          run this?"), different shape of answer.

          canPromote follows the lead-only gate rather than canAdd: saving a
          contact forward rewrites what every future year inherits. */}
      <div className="border-t border-border pt-6">
        <EventContactsPanel
          target={{ type: "plan", id: eventPlanId }}
          canEdit={canAdd}
          canRemove={canRemove}
          canPromote={hasCatalogEntry && canRemove}
        />
      </div>

      <Dialog
        open={showForm}
        onOpenChange={(open) => (open ? setShowForm(true) : resetForm())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Resource</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {MODES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    mode === value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {mode === "upload" && (
              <DocumentUploadFields
                file={file}
                onFileChange={setFile}
                disabled={loading}
              />
            )}

            {mode === "drive" && (
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Google Drive link
                </label>
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="https://docs.google.com/document/d/..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  We&apos;ll read and index the file&apos;s contents. It must be
                  shared with the service account above.
                </p>
              </div>
            )}

            {mode === "link" && (
              <div>
                <label className="mb-1 block text-sm font-medium">URL</label>
                <input
                  name="url"
                  type="url"
                  placeholder="https://..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  A plain link. Its contents won&apos;t be indexed for search.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                Title {mode !== "link" && "(optional)"}
              </label>
              <input
                name="title"
                required={mode === "link"}
                placeholder={
                  mode === "link" ? "" : "Defaults to the file name"
                }
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Adding..." : "Add Resource"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResourceRow({
  resource,
  canRemove,
}: {
  resource: Resource;
  canRemove: boolean;
}) {
  const [removing, setRemoving] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const isDocument = Boolean(resource.documentId);
  const typeLabel = isDocument
    ? fileTypeLabel(resource.documentMimeType, resource.documentFileName ?? "")
    : null;

  async function handleRemove() {
    const ok = await confirm({
      title: `Remove ${resource.title}?`,
      description: isDocument
        ? "The link to this plan is removed. The document itself stays in the Documents library."
        : "This resource is removed from the plan.",
      confirmLabel: "Remove",
    });
    if (!ok) return;

    setRemoving(true);
    try {
      await removeEventPlanResource(resource.id);
    } finally {
      setRemoving(false);
      closeConfirm();
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{resource.title}</p>
            {resource.url && (
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80"
                aria-label={`Open ${resource.title}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {typeLabel && (
              <Badge variant="outline" className="font-normal">
                {typeLabel}
              </Badge>
            )}
            {resource.documentStatus === "pending" && (
              <Badge variant="secondary" className="gap-1 font-normal">
                <Loader2 className="h-3 w-3 animate-spin" />
                Indexing
              </Badge>
            )}
            {resource.documentStatus === "ready" && (
              <Badge variant="success" className="font-normal">
                Searchable
              </Badge>
            )}
            {resource.documentStatus === "failed" && (
              <Badge variant="warning" className="font-normal">
                Not indexed
              </Badge>
            )}
          </div>
          {resource.notes && (
            <p className="text-xs text-muted-foreground">{resource.notes}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {[
              resource.addedByName ? `Added by ${resource.addedByName}` : null,
              formatFileSize(resource.documentFileSize) || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {canRemove && (
        <DeleteIconButton
          onClick={handleRemove}
          busy={removing}
          className="self-start sm:self-center"
          aria-label={`Remove ${resource.title}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </DeleteIconButton>
      )}
      {confirmDialog}
    </div>
  );
}
