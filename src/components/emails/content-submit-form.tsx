"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, Upload, X } from "lucide-react";
import { submitEmailContent, addContentImage } from "@/actions/email-content";
import type { EmailAudience } from "@/types";

export function ContentSubmitForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [audience, setAudience] = useState<EmailAudience>("all");
  const [targetDate, setTargetDate] = useState("");
  const [uploadedImages, setUploadedImages] = useState<
    Array<{ id: string; url: string; name: string }>
  >([]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload/email-image", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setUploadedImages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              url: data.url,
              name: file.name,
            },
          ]);
        }
      } catch (error) {
        console.error("Failed to upload image:", error);
      }
    }

    setIsUploading(false);
    e.target.value = "";
  }

  function removeImage(id: string) {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);

    try {
      const item = await submitEmailContent({
        title: title.trim(),
        description: description.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        linkText: linkText.trim() || undefined,
        audience,
        targetDate: targetDate || undefined,
      });

      // Add images to the content item
      for (const image of uploadedImages) {
        await addContentImage(item.id, {
          blobUrl: image.url,
          fileName: image.name,
        });
      }

      // Reset form
      setTitle("");
      setDescription("");
      setLinkUrl("");
      setLinkText("");
      setAudience("all");
      setTargetDate("");
      setUploadedImages([]);

      router.refresh();
    } catch (error) {
      console.error("Failed to submit content:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-medium">
            Title <span className="text-red-500">*</span>
          </label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Spirit Night at Pizza Palace"
            disabled={isSubmitting}
            required
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-2 block text-sm font-medium">
            Description
          </label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details about the event or announcement..."
            rows={4}
            disabled={isSubmitting}
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
              disabled={isSubmitting}
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
              placeholder="Sign up here"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="audience" className="mb-2 block text-sm font-medium">
              Audience
            </label>
            <select
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as EmailAudience)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              disabled={isSubmitting}
            >
              <option value="all">All (School-wide)</option>
              <option value="pta_only">PTA Members Only</option>
            </select>
          </div>

          <div>
            <label htmlFor="targetDate" className="mb-2 block text-sm font-medium">
              Target Date
            </label>
            <Input
              id="targetDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Images</label>
          <div className="space-y-3">
            {uploadedImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {uploadedImages.map((image) => (
                  <div
                    key={image.id}
                    className="group relative h-20 w-20 overflow-hidden rounded-md border"
                  >
                    <img
                      src={image.url}
                      alt={image.name}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-muted/50">
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>{isUploading ? "Uploading..." : "Upload images"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                disabled={isSubmitting || isUploading}
              />
            </label>
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting || !title.trim()} className="w-full">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Content"
          )}
        </Button>
      </form>
    </Card>
  );
}
