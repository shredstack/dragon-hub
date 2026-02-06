"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Trash2, Download, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteEventFlyer } from "@/actions/calendar";

interface Flyer {
  id: string;
  blobUrl: string;
  fileName: string;
  fileSize: number | null;
}

interface FlyerGalleryProps {
  flyers: Flyer[];
  canDelete?: boolean;
}

function isPdf(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pdf");
}

export function FlyerGallery({ flyers, canDelete = false }: FlyerGalleryProps) {
  const [selectedFlyer, setSelectedFlyer] = useState<Flyer | null>(null);
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (flyerId: string) => {
    if (!confirm("Are you sure you want to delete this flyer?")) return;

    setDeletingId(flyerId);
    startTransition(async () => {
      try {
        await deleteEventFlyer(flyerId);
      } catch (error) {
        console.error("Failed to delete flyer:", error);
        alert("Failed to delete flyer. Please try again.");
      } finally {
        setDeletingId(null);
      }
    });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {flyers.map((flyer) => {
          const isDeleting = deletingId === flyer.id;
          const isPdfFile = isPdf(flyer.fileName);

          return (
            <div
              key={flyer.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-muted"
            >
              {isPdfFile ? (
                <a
                  href={flyer.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex aspect-square items-center justify-center bg-muted hover:bg-muted/80"
                >
                  <div className="flex flex-col items-center gap-2 p-4 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {flyer.fileName}
                    </span>
                  </div>
                </a>
              ) : (
                <button
                  onClick={() => setSelectedFlyer(flyer)}
                  className="aspect-square w-full"
                  disabled={isDeleting}
                >
                  <Image
                    src={flyer.blobUrl}
                    alt={flyer.fileName}
                    width={300}
                    height={300}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </button>
              )}

              {/* Overlay with actions */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="truncate text-xs text-white">
                  {flyer.fileName}
                </span>
                <div className="flex gap-1">
                  <a
                    href={flyer.blobUrl}
                    download={flyer.fileName}
                    className="rounded p-1 text-white hover:bg-white/20"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(flyer.id);
                      }}
                      disabled={isDeleting}
                      className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {isDeleting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-sm text-white">Deleting...</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox dialog for images */}
      <Dialog
        open={!!selectedFlyer}
        onOpenChange={(open) => !open && setSelectedFlyer(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto p-0">
          <DialogTitle className="sr-only">
            {selectedFlyer?.fileName || "Flyer preview"}
          </DialogTitle>
          {selectedFlyer && !isPdf(selectedFlyer.fileName) && (
            <div className="relative">
              <Image
                src={selectedFlyer.blobUrl}
                alt={selectedFlyer.fileName}
                width={1200}
                height={1200}
                className="h-auto w-full"
              />
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-4">
                <span className="text-white">{selectedFlyer.fileName}</span>
                <a
                  href={selectedFlyer.blobUrl}
                  download={selectedFlyer.fileName}
                  className="rounded bg-white/20 px-3 py-1 text-sm text-white hover:bg-white/30"
                >
                  Download
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
