"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, X } from "lucide-react";
import { submitEmailContent, addContentImage } from "@/actions/email-content";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import {
  defaultContentWindow,
  isInvalidContentWindow,
} from "@/lib/email/content-window";
import { addDaysToDateOnly, toDateOnly } from "@/lib/date-only";
import type { EmailAudience } from "@/types";

interface ContentSubmitFormProps {
  /**
   * Today in the school's zone, resolved on the server. On Vercel the process
   * runs in UTC, where a Denver school is already tomorrow from 6pm onward —
   * and this value seeds the date the item starts going out.
   */
  today: string;
}

export function ContentSubmitForm({ today }: ContentSubmitFormProps) {
  const router = useRouter();
  const defaults = defaultContentWindow(today);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [audience, setAudience] = useState<EmailAudience>("all");
  const [startDate, setStartDate] = useState(toDateOnly(defaults.startDate));
  const [endDate, setEndDate] = useState(toDateOnly(defaults.endDate));
  const [uploadedImages, setUploadedImages] = useState<
    Array<{ id: string; url: string; name: string; linkUrl: string }>
  >([]);

  const windowIsBackwards = isInvalidContentWindow({ startDate, endDate });
  const canSubmit =
    Boolean(title.trim()) && Boolean(startDate) && Boolean(endDate) && !windowIsBackwards;

  async function handleImageUpload(files: File[]) {
    if (files.length === 0) return;

    setIsUploading(true);

    for (const file of files) {
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
              linkUrl: "",
            },
          ]);
        }
      } catch (error) {
        console.error("Failed to upload image:", error);
      }
    }

    setIsUploading(false);
  }

  function removeImage(id: string) {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  }

  function updateImageLinkUrl(id: string, linkUrl: string) {
    setUploadedImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, linkUrl } : img))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const item = await submitEmailContent({
        title: title.trim(),
        description: description.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        linkText: linkText.trim() || undefined,
        audience,
        startDate,
        endDate,
      });

      // Add images to the content item
      for (const image of uploadedImages) {
        await addContentImage(item.id, {
          blobUrl: image.url,
          fileName: image.name,
          linkUrl: image.linkUrl || undefined,
        });
      }

      // Reset form
      setTitle("");
      setDescription("");
      setLinkUrl("");
      setLinkText("");
      setAudience("all");
      setStartDate(toDateOnly(defaults.startDate));
      setEndDate(toDateOnly(defaults.endDate));
      setUploadedImages([]);

      router.refresh();
    } catch (err) {
      console.error("Failed to submit content:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong submitting this. Try again."
      );
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

        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4">
          <p className="mb-1 text-sm font-medium">When should this run?</p>
          <p className="mb-3 text-xs text-muted-foreground">
            These two dates are what put this in the weekly email — it appears
            automatically in every email whose week falls inside them, and drops
            out on its own afterwards. Nobody has to remember it. For something
            that is always relevant, push the end date out a year.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="startDate" className="mb-2 block text-sm font-medium">
                Start including it <span className="text-red-500">*</span>
              </label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <label htmlFor="endDate" className="mb-2 block text-sm font-medium">
                No longer relevant after <span className="text-red-500">*</span>
              </label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                onClick={() => setEndDate(addDaysToDateOnly(today, 365))}
                className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                disabled={isSubmitting}
              >
                It&apos;s always relevant — set a year out
              </button>
            </div>
          </div>

          {windowIsBackwards && (
            <p className="mt-2 text-xs text-destructive">
              The end date is before the start date, so this would never appear
              in an email.
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Images</label>
          <div className="space-y-3">
            {uploadedImages.length > 0 && (
              <div className="space-y-3">
                {uploadedImages.map((image) => (
                  <div
                    key={image.id}
                    className="flex gap-3 rounded-md border p-3"
                  >
                    <div className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border">
                      <img
                        src={image.url}
                        alt={image.name}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(image.id)}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium truncate" title={image.name}>
                        {image.name}
                      </p>
                      <Input
                        type="url"
                        value={image.linkUrl}
                        onChange={(e) => updateImageLinkUrl(image.id, e.target.value)}
                        placeholder="Link URL (optional) - makes image clickable"
                        className="h-8 text-sm"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <ImageDropzone
              onFiles={handleImageUpload}
              isUploading={isUploading}
              disabled={isSubmitting}
              multiple
              label="Drag images here, or click to browse"
              hint="You can also paste one from your clipboard."
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={isSubmitting || !canSubmit} className="w-full">
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
