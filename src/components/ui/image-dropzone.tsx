"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

/**
 * The one way to hand this app an image file.
 *
 * Three gestures, one target: drop a file on it, paste one from the clipboard,
 * or click to browse. The browse-only version this replaces meant a board
 * member with a flyer already on screen had to save it to disk and then go
 * find it again — the file was right there.
 *
 * It knows nothing about where the bytes go. The caller supplies `onFiles`,
 * which is what talks to the upload route, and owns the busy state — the
 * upload endpoints differ per surface (email images, media library) and their
 * responses are not interchangeable.
 */

/** Matches what the upload routes accept; a rejected type never leaves here. */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

interface ImageDropzoneProps {
  onFiles: (files: File[]) => void | Promise<void>;
  /** Caller-owned, because the caller owns the request. */
  isUploading?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  label?: string;
  hint?: string;
  className?: string;
}

export function ImageDropzone({
  onFiles,
  isUploading = false,
  disabled = false,
  multiple = false,
  label = "Drag an image here, or click to browse",
  hint,
  className = "",
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  // dragenter/dragleave fire for every child element the pointer crosses, so a
  // boolean flag flickers. Counting enters and leaves is the standard fix.
  const dragDepth = useRef(0);

  const isBusy = isUploading || disabled;

  const accept = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const files = Array.from(fileList);
      const usable = files.filter((f) => ACCEPTED_TYPES.includes(f.type));

      if (usable.length === 0) {
        setRejected(
          files.length === 1
            ? `"${files[0].name}" isn't an image we can use. Try a JPEG, PNG, GIF, or WebP.`
            : "Those files aren't images we can use. Try a JPEG, PNG, GIF, or WebP."
        );
        return;
      }

      setRejected(
        usable.length < files.length
          ? "Some files were skipped — only JPEG, PNG, GIF, and WebP images can be used."
          : null
      );
      void onFiles(multiple ? usable : usable.slice(0, 1));
    },
    [multiple, onFiles]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (isBusy) return;
    accept(e.dataTransfer.files);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (isBusy) return;
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (isBusy) return;
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      accept(files);
    }
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={isBusy ? -1 : 0}
        aria-disabled={isBusy}
        aria-label={label}
        onClick={() => !isBusy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (isBusy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        // Without preventDefault on dragover the browser navigates to the file.
        onDragOver={(e) => e.preventDefault()}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          isBusy
            ? "cursor-default border-input text-muted-foreground opacity-70"
            : "cursor-pointer text-muted-foreground hover:border-primary hover:bg-muted/50"
        } ${isDragging ? "border-primary bg-primary/5 text-primary" : "border-input"}`}
      >
        <span className="flex items-center gap-2">
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span>
            {isUploading ? "Uploading..." : isDragging ? "Drop to upload" : label}
          </span>
        </span>
        {hint && !isDragging && !isUploading && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          disabled={isBusy}
          onChange={(e) => {
            accept(e.target.files);
            // Reset so re-picking the same file fires onChange again.
            e.target.value = "";
          }}
        />
      </div>

      {rejected && <p className="mt-1 text-xs text-destructive">{rejected}</p>}
    </div>
  );
}
