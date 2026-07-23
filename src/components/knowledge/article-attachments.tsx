"use client";

import { useEffect, useState } from "react";
import { FileText, Paperclip, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DocumentUploadFields,
  uploadDocument,
} from "@/components/documents/document-upload-fields";
import { getArticleAttachments } from "@/actions/knowledge";
import { deleteDocument } from "@/actions/documents";
import { formatFileSize, fileTypeLabel } from "@/lib/documents/display";

type Attachment = Awaited<ReturnType<typeof getArticleAttachments>>[number];

interface Props {
  articleId: string;
  articleSlug: string;
  /** Board and school admins get the uploader; everyone else gets the list. */
  canManage?: boolean;
}

/**
 * Files hanging off a Knowledge Base article.
 *
 * The article's audience is the *only* thing deciding who can see these — the
 * server action refuses to list attachments for an article the caller can't
 * read. That's why uploads live here rather than on the board-only documents
 * page: attaching a handbook to an article shared with the Yearbook Committee
 * is how a file reaches a role, in one step, with no second permission model.
 */
export function ArticleAttachments({
  articleId,
  articleSlug,
  canManage = false,
}: Props) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleSlug]);

  async function load() {
    setLoading(true);
    try {
      setItems(await getArticleAttachments(articleSlug));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(file, { knowledgeArticleId: articleId });
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from this article?`)) return;
    try {
      await deleteDocument(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove file.");
    }
  }

  if (loading) return null;
  if (items.length === 0 && !canManage) return null;

  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">
          Attachments{items.length > 0 && ` (${items.length})`}
        </h2>
      </div>

      {items.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          No files attached yet. Anyone who can read this article will be able
          to open what you attach here.
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {items.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
            >
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {doc.title || doc.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fileTypeLabel(doc.mimeType, doc.fileName)}
                  {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ""}
                </p>
              </div>
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Open ${doc.title || doc.fileName}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id, doc.title || doc.fileName)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${doc.title || doc.fileName}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="space-y-3 border-t border-border pt-4">
          <DocumentUploadFields
            file={file}
            onFileChange={setFile}
            disabled={uploading}
          />
          {file && (
            <Button onClick={handleUpload} disabled={uploading} size="sm">
              {uploading ? "Uploading…" : "Attach file"}
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
