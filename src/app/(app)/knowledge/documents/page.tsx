"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  listSchoolDocuments,
  deleteDocument,
  reprocessDocument,
  addDriveLinkDocument,
  canManageSchoolDocuments,
  type SchoolDocument,
} from "@/actions/documents";
import {
  formatFileSize,
  fileTypeLabel,
  DOCUMENT_SOURCE_LABELS,
} from "@/lib/documents/display";
import {
  ArrowLeft,
  Search,
  Plus,
  ExternalLink,
  Trash2,
  Loader2,
  RefreshCw,
  FileText,
} from "lucide-react";

const SOURCE_TABS = [
  { value: "", label: "All" },
  { value: "upload", label: "Uploaded" },
  { value: "drive_link", label: "Shared links" },
  { value: "google_drive", label: "Synced from Drive" },
] as const;

/**
 * Every document the school has indexed, in one place. Files synced from Drive
 * sit alongside documents uploaded here, because from a planner's point of view
 * they're the same thing: institutional knowledge the AI can draw on.
 */
export default function DocumentsPage() {
  const [documents, setDocuments] = useState<SchoolDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  // null until the permission check resolves — the list is board-only, so we
  // can't fetch anything before we know.
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await listSchoolDocuments({
        source: source
          ? (source as "google_drive" | "upload" | "drive_link")
          : undefined,
        search: submittedQuery || undefined,
      });
      setDocuments(results);
    } finally {
      setLoading(false);
    }
  }, [source, submittedQuery]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  useEffect(() => {
    canManageSchoolDocuments().then(setCanManage);
  }, []);

  if (canManage === null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div>
        <Link
          href="/knowledge"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Knowledge Base
        </Link>
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            The document index is available to PTA Board members and school
            admins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/knowledge"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Knowledge Base
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground">
            Uploaded and synced files. Everything here is searchable and
            available to AI event planning.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Add Document
          </Button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedQuery(query);
        }}
        className="mb-4 flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents and their contents..."
            className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      <div className="mb-4 flex gap-2 overflow-x-auto border-b border-border">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setSource(tab.value)}
            className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              source === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {submittedQuery
              ? "No documents matched that search."
              : "No documents yet."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {doc.title || doc.fileName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {doc.description || doc.fileName}
                    </p>
                  </div>
                  <DocumentActions doc={doc} onChange={load} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-normal">
                    {fileTypeLabel(doc.mimeType, doc.fileName)}
                  </Badge>
                  <Badge variant="secondary" className="font-normal">
                    {DOCUMENT_SOURCE_LABELS[doc.source]}
                  </Badge>
                  <StatusBadge doc={doc} />
                  {doc.schoolYear && (
                    <span className="text-xs text-muted-foreground">
                      {doc.schoolYear}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Year</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-medium">
                          {doc.title || doc.fileName}
                        </p>
                        {doc.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {doc.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-normal">
                          {fileTypeLabel(doc.mimeType, doc.fileName)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {DOCUMENT_SOURCE_LABELS[doc.source]}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {doc.schoolYear || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge doc={doc} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatFileSize(doc.fileSize) || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <DocumentActions doc={doc} onChange={load} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <AddDocumentDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onAdded={load}
      />
    </div>
  );
}

function StatusBadge({ doc }: { doc: SchoolDocument }) {
  if (doc.processingStatus === "pending") {
    return (
      <Badge variant="secondary" className="gap-1 font-normal">
        <Loader2 className="h-3 w-3 animate-spin" />
        Indexing
      </Badge>
    );
  }
  if (doc.processingStatus === "failed") {
    return (
      <Badge variant="warning" className="font-normal">
        Not indexed
      </Badge>
    );
  }
  return (
    <Badge
      variant={doc.hasContent ? "success" : "outline"}
      className="font-normal"
    >
      {doc.hasContent ? "Searchable" : "Name only"}
    </Badge>
  );
}

function DocumentActions({
  doc,
  onChange,
}: {
  doc: SchoolDocument;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const canDelete = doc.source !== "google_drive";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {doc.url && (
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:text-primary/80"
          aria-label={`Open ${doc.title || doc.fileName}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
      {doc.processingStatus === "failed" && (
        <button
          onClick={() => run(() => reprocessDocument(doc.id))}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Retry indexing"
          title={doc.processingError || "Retry indexing"}
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </button>
      )}
      {canDelete && (
        <button
          onClick={() => run(() => deleteDocument(doc.id))}
          disabled={busy}
          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          aria-label={`Delete ${doc.title || doc.fileName}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

function AddDocumentDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [mode, setMode] = useState<"upload" | "drive">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setError(null);
    setMode("upload");
    onClose();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const title = ((formData.get("title") as string) || "").trim();
    const description = ((formData.get("description") as string) || "").trim();
    const url = ((formData.get("url") as string) || "").trim();

    setLoading(true);
    try {
      if (mode === "upload") {
        if (!file) {
          setError("Choose a file to upload.");
          return;
        }
        await uploadDocument(file, {
          title: title || undefined,
          description: description || undefined,
        });
      } else {
        await addDriveLinkDocument({
          url,
          title: title || undefined,
          description: description || undefined,
        });
      }
      reset();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : reset())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
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
              <p className="mt-1 text-xs text-muted-foreground">
                The file must be shared with the school&apos;s service account.
              </p>
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

          <div>
            <label className="mb-1 block text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              name="description"
              rows={2}
              placeholder="What is this and when is it useful?"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Adding..." : "Add Document"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
