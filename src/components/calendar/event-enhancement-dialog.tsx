"use client";

import { useState, useTransition, useRef } from "react";
import { Pencil, Upload, Loader2, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { updateEventPtaDescription, deleteEventFlyer } from "@/actions/calendar";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface Flyer {
  id: string;
  blobUrl: string;
  fileName: string;
  fileSize: number | null;
}

interface EventEnhancementDialogProps {
  eventId: string;
  currentDescription: string | null;
  flyers: Flyer[];
}

function isPdf(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pdf");
}

export function EventEnhancementDialog({
  eventId,
  currentDescription,
  flyers,
}: EventEnhancementDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(currentDescription || "");
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localFlyers, setLocalFlyers] = useState<Flyer[]>(flyers);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSaveDescription = () => {
    startTransition(async () => {
      try {
        await updateEventPtaDescription(eventId, description);
        router.refresh();
      } catch (error) {
        console.error("Failed to save description:", error);
        alert("Failed to save description. Please try again.");
      }
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("eventId", eventId);

      try {
        const response = await fetch("/api/upload/calendar-flyer", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Upload failed");
        }

        const { flyer } = await response.json();
        setLocalFlyers((prev) => [...prev, flyer]);
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadError(
          error instanceof Error ? error.message : "Upload failed"
        );
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    router.refresh();
  };

  const handleDeleteFlyer = async (flyerId: string) => {
    if (!confirm("Are you sure you want to delete this flyer?")) return;

    startTransition(async () => {
      try {
        await deleteEventFlyer(flyerId);
        setLocalFlyers((prev) => prev.filter((f) => f.id !== flyerId));
        router.refresh();
      } catch (error) {
        console.error("Failed to delete flyer:", error);
        alert("Failed to delete flyer. Please try again.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 h-4 w-4" />
          Edit Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Event Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* PTA Description */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              PTA Notes / Additional Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add additional information for parents..."
              className="h-32 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              onClick={handleSaveDescription}
              disabled={isPending}
              size="sm"
              className="mt-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Description"
              )}
            </Button>
          </div>

          {/* Flyers */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Flyers & Attachments
            </label>

            {/* Upload button */}
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="flyer-upload"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-1 h-4 w-4" />
                    Upload Flyer
                  </>
                )}
              </Button>
              {uploadError && (
                <p className="mt-1 text-sm text-destructive">{uploadError}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Supported: JPEG, PNG, GIF, WebP, PDF (max 10MB)
              </p>
            </div>

            {/* Existing flyers */}
            {localFlyers.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {localFlyers.map((flyer) => (
                  <div
                    key={flyer.id}
                    className="group relative overflow-hidden rounded border border-border"
                  >
                    {isPdf(flyer.fileName) ? (
                      <div className="flex aspect-square items-center justify-center bg-muted">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    ) : (
                      <Image
                        src={flyer.blobUrl}
                        alt={flyer.fileName}
                        width={150}
                        height={150}
                        className="aspect-square w-full object-cover"
                      />
                    )}
                    <button
                      onClick={() => handleDeleteFlyer(flyer.id)}
                      disabled={isPending}
                      className="absolute right-1 top-1 rounded bg-destructive p-1 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                      <span className="line-clamp-1 text-xs text-white">
                        {flyer.fileName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No flyers attached yet.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
