"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatFileSize } from "@/lib/documents/display";

export interface MailingAttachmentView {
  id: string;
  fileName: string;
  blobUrl: string;
  fileSize: number | null;
}

/**
 * The two kinds of attachment a mailing can carry.
 *
 * The generated roster is the interesting one: it is built per group, so Room
 * 12's email gets Room 12's volunteers and a DLI grade's gets both rooms'. It
 * is a setting here and a download button on each group, because nothing in a
 * browser can put a file into Gmail for you.
 */
export function AttachmentManager({
  mailingId,
  attachments,
  rosterPresetId,
  rosterPresets,
  onRosterPresetChange,
}: {
  mailingId: string;
  attachments: MailingAttachmentView[];
  rosterPresetId: string | null;
  rosterPresets: { id: string; label: string; description: string }[];
  onRosterPresetChange: (presetId: string | null) => void;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const selected = rosterPresets.find((p) => p.id === rosterPresetId);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mailingId", mailingId);
      const res = await fetch("/api/upload/mailing-attachment", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      addToast(`${file.name} attached.`, "success");
      router.refresh();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Couldn't upload that.",
        "destructive"
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (id: string, fileName: string) => {
    try {
      const res = await fetch(
        `/api/upload/mailing-attachment?attachmentId=${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      addToast(`${fileName} removed.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't remove that.", "destructive");
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <Label htmlFor="roster-preset">Attach each group&apos;s roster</Label>
        <p className="mb-2 text-xs text-muted-foreground">
          A spreadsheet built for each group, covering its own classrooms. This
          is what the room parent onboarding email carries.
        </p>
        <select
          id="roster-preset"
          value={rosterPresetId ?? ""}
          onChange={(e) => onRosterPresetChange(e.target.value || null)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-sm"
        >
          <option value="">No roster</option>
          {rosterPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {selected && (
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.description}
          </p>
        )}
      </div>

      <div>
        <Label>Files for every group</Label>
        <p className="mb-2 text-xs text-muted-foreground">
          The same file on every email — a handbook, a flyer. Up to 25MB each.
        </p>

        {attachments.length > 0 && (
          <ul className="mb-2 space-y-1">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{a.fileName}</span>
                  {a.fileSize != null && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatFileSize(a.fileSize)}
                    </span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(a.id, a.fileName)}
                  aria-label={`Remove ${a.fileName}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Add a file"}
        </Button>
      </div>
    </div>
  );
}
