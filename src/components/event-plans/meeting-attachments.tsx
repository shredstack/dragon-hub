"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DocumentUploadFields,
  uploadDocument,
} from "@/components/documents/document-upload-fields";
import { addDriveLinkDocument, deleteDocument } from "@/actions/documents";
import { formatFileSize, fileTypeLabel } from "@/lib/documents/display";
import { Paperclip, Plus, ExternalLink, Trash2, Loader2 } from "lucide-react";

export interface MeetingDocument {
  id: string;
  fileName: string;
  title: string | null;
  mimeType: string | null;
  fileSize: number | null;
  source: string;
  url: string | undefined;
  processingStatus: string;
}

interface MeetingAttachmentsProps {
  meetingId: string;
  documents: MeetingDocument[];
  canManage: boolean;
}

/**
 * Documents attached to a meeting — the agenda handout, the sign-up sheet, the
 * finalized notes doc. These are indexed like any other document, so what gets
 * decided in a meeting stays available to whoever plans this event next year.
 */
export function MeetingAttachments({
  meetingId,
  documents,
  canManage,
}: MeetingAttachmentsProps) {
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"upload" | "drive">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    const url = ((formData.get("url") as string) || "").trim();

    setLoading(true);
    try {
      if (mode === "upload") {
        if (!file) {
          setError("Choose a file to upload.");
          return;
        }
        await uploadDocument(file, { title: title || undefined, meetingId });
      } else {
        await addDriveLinkDocument({
          url,
          title: title || undefined,
          meetingId,
        });
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(documentId: string) {
    setDeletingId(documentId);
    try {
      await deleteDocument(documentId);
    } finally {
      setDeletingId(null);
    }
  }

  if (documents.length === 0 && !canManage) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
        </p>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Attach agendas, handouts, or finalized notes so they&apos;re
          searchable next year.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-sm">
                  {doc.title || doc.fileName}
                </span>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {fileTypeLabel(doc.mimeType, doc.fileName)}
                </Badge>
                {doc.processingStatus === "pending" && (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                )}
                {doc.fileSize ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(doc.fileSize)}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80"
                    aria-label={`Open ${doc.title || doc.fileName}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {canManage && (
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    aria-label={`Remove ${doc.title || doc.fileName}`}
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={showForm}
        onOpenChange={(open) => (open ? setShowForm(true) : resetForm())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Attachment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["upload", "Upload file"],
                  ["drive", "Google Drive link"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    mode === value
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "upload" ? (
              <DocumentUploadFields
                file={file}
                onFileChange={setFile}
                disabled={loading}
              />
            ) : (
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
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">
                Title (optional)
              </label>
              <input
                name="title"
                placeholder="Defaults to the file name"
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
                {loading ? "Adding..." : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
