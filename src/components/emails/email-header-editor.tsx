"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, X, Image as ImageIcon, RotateCcw, Check } from "lucide-react";
import { SimpleRichTextEditor } from "./simple-rich-text-editor";
import { MediaPicker } from "@/components/media/media-picker";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import {
  updateEmailCampaign,
  saveCampaignHeaderAsDefault,
} from "@/actions/email-campaigns";
import {
  DEFAULT_EMAIL_HEADER_HTML,
  EMAIL_HEADER_VARIABLES,
} from "@/lib/email/header";
import type { MediaLibraryItemWithUploader } from "@/types";

export interface CampaignHeader {
  headerHtml: string | null;
  headerImageUrl: string | null;
  headerImageAlt: string | null;
}

interface EmailHeaderEditorProps {
  campaignId: string;
  header: CampaignHeader;
  onClose: () => void;
  onSave: (header: CampaignHeader) => void;
}

/**
 * Edits the block that opens the email — the greeting, the line under it, and
 * an optional banner.
 *
 * The header is a per-campaign snapshot, so saving here changes this week's
 * email and nothing else. "Use this for future emails" is a separate button
 * precisely because a Thanksgiving-week banner shouldn't quietly become the
 * house style.
 */
export function EmailHeaderEditor({
  campaignId,
  header,
  onClose,
  onSave,
}: EmailHeaderEditorProps) {
  // `null` means "never customized", which renders as the built-in wording —
  // so that is what the editor opens with, and deleting it all is how you get
  // an email that opens straight on the first section.
  const [html, setHtml] = useState(header.headerHtml ?? DEFAULT_EMAIL_HEADER_HTML);
  const [imageUrl, setImageUrl] = useState(header.headerImageUrl || "");
  const [imageAlt, setImageAlt] = useState(header.headerImageAlt || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [savedAsDefault, setSavedAsDefault] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(files: File[]) {
    const file = files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload/email-image", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setImageUrl(data.url);
      setImageAlt(file.name);
    } catch (err) {
      console.error("Failed to upload header image:", err);
      setError("That image didn't upload. Try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleMediaSelect(item: MediaLibraryItemWithUploader) {
    setImageUrl(item.blobUrl);
    setImageAlt(item.altText || item.fileName);
    setShowMediaPicker(false);
  }

  function currentHeader(): CampaignHeader {
    return {
      headerHtml: html,
      headerImageUrl: imageUrl || null,
      headerImageAlt: imageAlt || null,
    };
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const next = currentHeader();
      await updateEmailCampaign(campaignId, next);
      onSave(next);
      onClose();
    } catch (err) {
      console.error("Failed to save header:", err);
      setError("That didn't save. Try again.");
      setIsSaving(false);
    }
  }

  /**
   * Saves first, then promotes: the default is read off the stored campaign
   * row, so promoting unsaved edits would file the *old* header as the default.
   */
  async function handleSaveAsDefault() {
    setIsSavingDefault(true);
    setError(null);
    try {
      const next = currentHeader();
      await updateEmailCampaign(campaignId, next);
      await saveCampaignHeaderAsDefault(campaignId);
      onSave(next);
      setSavedAsDefault(true);
      setTimeout(() => setSavedAsDefault(false), 2500);
    } catch (err) {
      console.error("Failed to save header as default:", err);
      setError("That didn't save. Try again.");
    } finally {
      setIsSavingDefault(false);
    }
  }

  const isBusy = isSaving || isSavingDefault;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Email Header</DialogTitle>
            <DialogDescription>
              The block that opens this email, above the first section. It
              belongs to this week&apos;s email only until you make it the
              default.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Banner image
              </label>
              {imageUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={imageAlt}
                    className="max-h-40 rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl("");
                      setImageAlt("");
                    }}
                    className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-sm hover:bg-red-600"
                    aria-label="Remove banner image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <ImageDropzone
                    className="flex-1"
                    onFiles={handleUpload}
                    isUploading={isUploading}
                    label="Drag a banner here, or click to browse"
                    hint="You can also paste one from your clipboard."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-[60px] px-4"
                    onClick={() => setShowMediaPicker(true)}
                  >
                    <ImageIcon className="h-4 w-4" />
                    Library
                  </Button>
                </div>
              )}

              {imageUrl && (
                <div className="mt-3">
                  <label
                    htmlFor="headerImageAlt"
                    className="mb-1 block text-xs font-medium"
                  >
                    Image description (for screen readers)
                  </label>
                  <Input
                    id="headerImageAlt"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                    placeholder="Dragon Elementary PTA banner"
                  />
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-sm font-medium">
                  Welcome text
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHtml(DEFAULT_EMAIL_HEADER_HTML)}
                  className="h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset wording
                </Button>
              </div>
              <SimpleRichTextEditor
                value={html}
                onChange={setHtml}
                tools={["bold", "italic", "underline", "link"]}
                minHeightClass="min-h-[120px]"
                placeholder="Leave empty to open straight on the first section."
              />
              <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2">
                {EMAIL_HEADER_VARIABLES.map((variable) => (
                  <p key={variable.token} className="text-xs text-muted-foreground">
                    <code className="rounded bg-background px-1 py-0.5 font-mono">
                      {variable.token}
                    </code>{" "}
                    — {variable.hint}
                  </p>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleSaveAsDefault}
              disabled={isBusy}
              className="w-full sm:mr-auto sm:w-auto"
            >
              {isSavingDefault ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedAsDefault ? (
                <Check className="h-4 w-4" />
              ) : null}
              {savedAsDefault ? "Saved as default" : "Use for future emails"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={isBusy}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isBusy}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaPicker
        open={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={handleMediaSelect}
      />
    </>
  );
}
