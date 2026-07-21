"use client";

import { useRef, useState } from "react";
import { Upload, X, FileText } from "lucide-react";
import { formatFileSize } from "@/lib/documents/display";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif";

interface DocumentUploadFieldsProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

/**
 * File picker with drag-and-drop for document uploads. Deliberately just the
 * field — the surrounding form owns the title, notes, and submit behavior so
 * this can sit inside the Resources dialog, a meeting form, or the Knowledge
 * Base uploader without carrying any of their assumptions.
 */
export function DocumentUploadFields({
  file,
  onFileChange,
  disabled,
}: DocumentUploadFieldsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    if (candidate.size > MAX_FILE_SIZE) {
      setError("That file is larger than 25MB.");
      return;
    }
    setError(null);
    onFileChange(candidate);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFileChange(null)}
          disabled={disabled}
          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
        className={`flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors disabled:opacity-50 ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40"
        }`}
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          Drop a file here, or click to browse
        </span>
        <span className="text-xs text-muted-foreground">
          PDF, Word, Excel, PowerPoint, text, or images — up to 25MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** The created index row, shaped so a list can render it right away. */
export interface UploadedDocument {
  id: string;
  fileName: string;
  title: string | null;
  mimeType: string | null;
  fileSize: number | null;
  source: string;
  url: string | undefined;
  processingStatus: string;
}

/**
 * Upload a document to the school's document index.
 */
export async function uploadDocument(
  file: File,
  fields: {
    title?: string;
    description?: string;
    eventPlanId?: string;
    meetingId?: string;
  }
): Promise<UploadedDocument> {
  const formData = new FormData();
  formData.append("file", file);
  if (fields.title) formData.append("title", fields.title);
  if (fields.description) formData.append("description", fields.description);
  if (fields.eventPlanId) formData.append("eventPlanId", fields.eventPlanId);
  if (fields.meetingId) formData.append("meetingId", fields.meetingId);

  const response = await fetch("/api/upload/document", {
    method: "POST",
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return data.document as UploadedDocument;
}
