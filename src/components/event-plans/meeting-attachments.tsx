"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { DocumentViewer } from "@/components/documents/document-viewer";
import {
  DeleteIconButton,
  useConfirm,
} from "@/components/ui/confirm-dialog";
import {
  addDriveLinkDocument,
  deleteDocument,
  reprocessDocument,
} from "@/actions/documents";
import { formatFileSize, fileTypeLabel } from "@/lib/documents/display";
import { previewKind } from "@/lib/documents/preview";
import {
  Paperclip,
  Plus,
  ExternalLink,
  Trash2,
  Loader2,
  Eye,
  RefreshCw,
} from "lucide-react";

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
/**
 * Whether this attachment has actually made it into the search index.
 *
 * Matches the badges on the Resources tab and the Documents page — a meeting
 * handout is indexed by exactly the same pipeline, and saying so is the whole
 * reason someone bothers to attach it here instead of emailing it around.
 */
function AttachmentStatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
        <Loader2 className="h-3 w-3 animate-spin" />
        Indexing
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="warning" className="shrink-0 font-normal">
        Not indexed
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="shrink-0 font-normal">
      Searchable
    </Badge>
  );
}

export function MeetingAttachments({
  meetingId,
  documents,
  canManage,
}: MeetingAttachmentsProps) {
  const router = useRouter();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"upload" | "drive">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<MeetingDocument | null>(null);
  // Attachments added in this session, shown immediately. The upload goes
  // through an API route, so the server data behind this card only catches up
  // once router.refresh() lands — without these the file appears to vanish.
  const [justAdded, setJustAdded] = useState<MeetingDocument[]>([]);

  const visible = [
    ...documents,
    ...justAdded.filter((added) => !documents.some((d) => d.id === added.id)),
  ];

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
      const added =
        mode === "upload"
          ? file
            ? await uploadDocument(file, { title: title || undefined, meetingId })
            : null
          : await addDriveLinkDocument({
              url,
              title: title || undefined,
              meetingId,
            });

      if (!added) {
        setError("Choose a file to upload.");
        return;
      }

      setJustAdded((current) => [...current, added]);
      resetForm();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReprocess(documentId: string) {
    setRetryingId(documentId);
    try {
      await reprocessDocument(documentId);
      // The status lives in server data, so the badge only settles on refresh.
      setJustAdded((current) =>
        current.filter((d) => d.id !== documentId)
      );
      router.refresh();
    } finally {
      setRetryingId(null);
    }
  }

  async function handleDelete(doc: { id: string; title: string | null; fileName: string }) {
    const label = doc.title || doc.fileName;
    const ok = await confirm({
      title: `Delete ${label}?`,
      description:
        "The file is removed from this meeting and from storage. Nothing else is affected.",
      confirmLabel: "Delete file",
    });
    if (!ok) return;

    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      setJustAdded((current) => current.filter((d) => d.id !== doc.id));
      router.refresh();
    } finally {
      setDeletingId(null);
      closeConfirm();
    }
  }

  if (visible.length === 0 && !canManage) return null;

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

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Attach agendas, handouts, or finalized notes so they&apos;re
          searchable next year.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 truncate text-sm">
                  {doc.title || doc.fileName}
                </span>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {fileTypeLabel(doc.mimeType, doc.fileName)}
                </Badge>
                <AttachmentStatusBadge status={doc.processingStatus} />
                {doc.fileSize ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(doc.fileSize)}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {previewKind(doc) && (
                  <button
                    onClick={() => setViewing(doc)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`View ${doc.title || doc.fileName}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
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
                {canManage && doc.processingStatus === "failed" && (
                  <button
                    onClick={() => handleReprocess(doc.id)}
                    disabled={retryingId === doc.id}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label={`Retry indexing ${doc.title || doc.fileName}`}
                    title="Retry indexing"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${retryingId === doc.id ? "animate-spin" : ""}`}
                    />
                  </button>
                )}
                {canManage && (
                  <DeleteIconButton
                    onClick={() => handleDelete(doc)}
                    busy={deletingId === doc.id}
                    aria-label={`Remove ${doc.title || doc.fileName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </DeleteIconButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <DocumentViewer
          document={viewing}
          open={Boolean(viewing)}
          onOpenChange={(open) => !open && setViewing(null)}
        />
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

      {confirmDialog}
    </div>
  );
}
