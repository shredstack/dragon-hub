"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Upload, X } from "lucide-react";
import { updateEmailSection } from "@/actions/email-campaigns";
import { SimpleRichTextEditor } from "./simple-rich-text-editor";
import type { EmailAudience, EmailSectionType } from "@/types";

interface SectionData {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkText: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageLinkUrl: string | null;
  sectionType: EmailSectionType;
  recurringKey: string | null;
  audience: EmailAudience;
  sortOrder: number;
}

interface SectionEditorProps {
  campaignId: string;
  section: SectionData;
  onClose: () => void;
  onSave: (section: SectionData) => void;
}

export function SectionEditor({
  campaignId,
  section,
  onClose,
  onSave,
}: SectionEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [body, setBody] = useState(section.body);
  const [linkUrl, setLinkUrl] = useState(section.linkUrl || "");
  const [linkText, setLinkText] = useState(section.linkText || "");
  const [imageUrl, setImageUrl] = useState(section.imageUrl || "");
  const [imageAlt, setImageAlt] = useState(section.imageAlt || "");
  const [imageLinkUrl, setImageLinkUrl] = useState(section.imageLinkUrl || "");
  const [audience, setAudience] = useState<EmailAudience>(section.audience);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sectionId", section.id);

    try {
      const res = await fetch("/api/upload/email-image", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.url);
        setImageAlt(file.name);
      }
    } catch (error) {
      console.error("Failed to upload image:", error);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  function handleRemoveImage() {
    setImageUrl("");
    setImageAlt("");
    setImageLinkUrl("");
  }

  async function handleSave() {
    setIsSaving(true);

    try {
      await updateEmailSection(section.id, {
        title,
        body,
        linkUrl: linkUrl || null,
        linkText: linkText || null,
        imageUrl: imageUrl || null,
        imageAlt: imageAlt || null,
        imageLinkUrl: imageLinkUrl || null,
        audience,
      });

      onSave({
        ...section,
        title,
        body,
        linkUrl: linkUrl || null,
        linkText: linkText || null,
        imageUrl: imageUrl || null,
        imageAlt: imageAlt || null,
        imageLinkUrl: imageLinkUrl || null,
        audience,
      });
    } catch (error) {
      console.error("Failed to save section:", error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Section</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label htmlFor="title" className="mb-2 block text-sm font-medium">
              Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Section title"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Body
            </label>
            <SimpleRichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Write your content here..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="linkUrl" className="mb-2 block text-sm font-medium">
                Link URL
              </label>
              <Input
                id="linkUrl"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <label htmlFor="linkText" className="mb-2 block text-sm font-medium">
                Link Text
              </label>
              <Input
                id="linkText"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Click here"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Image</label>
            {imageUrl ? (
              <div className="relative inline-block">
                <img
                  src={imageUrl}
                  alt={imageAlt}
                  className="max-h-40 rounded-md border"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-sm hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-muted/50">
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>{isUploading ? "Uploading..." : "Upload image"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            )}

            {imageUrl && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="imageAlt"
                    className="mb-1 block text-xs font-medium"
                  >
                    Image Alt Text
                  </label>
                  <Input
                    id="imageAlt"
                    value={imageAlt}
                    onChange={(e) => setImageAlt(e.target.value)}
                    placeholder="Description"
                  />
                </div>
                <div>
                  <label
                    htmlFor="imageLinkUrl"
                    className="mb-1 block text-xs font-medium"
                  >
                    Image Link URL
                  </label>
                  <Input
                    id="imageLinkUrl"
                    type="url"
                    value={imageLinkUrl}
                    onChange={(e) => setImageLinkUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="audience" className="mb-2 block text-sm font-medium">
              Audience
            </label>
            <select
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as EmailAudience)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All (School-wide)</option>
              <option value="pta_only">PTA Members Only</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
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
  );
}
