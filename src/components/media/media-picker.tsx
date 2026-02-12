"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Upload,
  Check,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { getMediaLibrary } from "@/actions/media-library";
import type { MediaLibraryItemWithUploader } from "@/types";

interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaLibraryItemWithUploader) => void;
  allowUpload?: boolean;
}

export function MediaPicker({
  open,
  onClose,
  onSelect,
  allowUpload = true,
}: MediaPickerProps) {
  const [items, setItems] = useState<MediaLibraryItemWithUploader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      loadMedia();
    } else {
      // Reset state when closing
      setSelectedId(null);
      setSearchQuery("");
    }
  }, [open]);

  async function loadMedia() {
    setIsLoading(true);
    try {
      const data = await getMediaLibrary({ reusableOnly: true });
      setItems(data as MediaLibraryItemWithUploader[]);
    } catch (error) {
      console.error("Failed to load media:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload/media-library", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // Add uploader placeholder for the new item
        const newItem = {
          ...data.item,
          uploader: null,
        } as MediaLibraryItemWithUploader;
        setItems((prev) => [newItem, ...prev]);
        setSelectedId(data.item.id);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  function handleConfirm() {
    const selected = items.find((i) => i.id === selectedId);
    if (selected) {
      onSelect(selected);
      onClose();
    }
  }

  const filteredItems = items.filter(
    (item) =>
      item.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.altText?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80dvh] sm:max-w-3xl flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Image</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, alt text, or tag..."
              className="pl-9"
            />
          </div>
          {allowUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
                disabled={isUploading}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isUploading}
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No images found</p>
              {searchQuery && (
                <p className="text-sm mt-1">
                  Try a different search term or upload a new image.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                    selectedId === item.id
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent hover:border-muted-foreground/20"
                  }`}
                >
                  <img
                    src={item.blobUrl}
                    alt={item.altText || item.fileName}
                    className="w-full h-full object-cover"
                  />
                  {selectedId === item.id && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                      {item.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] px-1 py-0 bg-black/50 text-white"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
