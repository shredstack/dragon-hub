"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  Trash2,
  Pencil,
  Search,
  Loader2,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { updateMediaItem, deleteMediaItem } from "@/actions/media-library";
import type { MediaLibraryItemWithUploader } from "@/types";

interface Tag {
  id: string;
  name: string;
  displayName: string;
}

interface MediaLibraryAdminProps {
  initialMedia: MediaLibraryItemWithUploader[];
  availableTags: Tag[];
}

export function MediaLibraryAdmin({
  initialMedia,
  availableTags,
}: MediaLibraryAdminProps) {
  const [items, setItems] = useState(initialMedia);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [editingItem, setEditingItem] =
    useState<MediaLibraryItemWithUploader | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const newItem = {
          ...data.item,
          uploader: null,
        } as MediaLibraryItemWithUploader;
        setItems((prev) => [newItem, ...prev]);
        // Open edit dialog immediately after upload
        setEditingItem(newItem);
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this image? This cannot be undone.")) return;

    setDeletingId(id);
    try {
      await deleteMediaItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setDeletingId(null);
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
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search media..."
            className="pl-9"
          />
        </div>
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
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload Image
          </Button>
        </>
      </div>

      {/* Media Grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No media found</p>
          {searchQuery ? (
            <p className="text-sm mt-1">Try a different search term.</p>
          ) : (
            <p className="text-sm mt-1">
              Upload your first image to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredItems.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="aspect-square relative bg-muted">
                <img
                  src={item.blobUrl}
                  alt={item.altText || item.fileName}
                  className="w-full h-full object-cover"
                />
                {!item.reusable && (
                  <Badge
                    className="absolute top-2 left-2"
                    variant="secondary"
                  >
                    Private
                  </Badge>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate" title={item.fileName}>
                  {item.fileName}
                </p>
                {item.altText && item.altText !== item.fileName && (
                  <p className="text-xs text-muted-foreground truncate" title={item.altText}>
                    {item.altText}
                  </p>
                )}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {item.tags.length > 2 && (
                      <Badge variant="outline" className="text-xs">
                        +{item.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex gap-1 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingItem(item)}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      {editingItem && (
        <MediaEditDialog
          item={editingItem}
          availableTags={availableTags}
          onClose={() => setEditingItem(null)}
          onSave={(updated) => {
            setItems((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

// Media edit dialog component
interface MediaEditDialogProps {
  item: MediaLibraryItemWithUploader;
  availableTags: Tag[];
  onClose: () => void;
  onSave: (item: MediaLibraryItemWithUploader) => void;
}

function MediaEditDialog({
  item,
  availableTags,
  onClose,
  onSave,
}: MediaEditDialogProps) {
  const [fileName, setFileName] = useState(item.fileName);
  const [altText, setAltText] = useState(item.altText || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags || []);
  const [reusable, setReusable] = useState(item.reusable);
  const [isSaving, setIsSaving] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await updateMediaItem(item.id, {
        fileName,
        altText,
        tags: selectedTags,
        reusable,
      });
      onSave({ ...item, fileName, altText, tags: selectedTags, reusable });
    } catch (error) {
      console.error("Failed to update:", error);
    } finally {
      setIsSaving(false);
    }
  }

  function addTag(tagName: string) {
    if (!selectedTags.includes(tagName)) {
      setSelectedTags((prev) => [...prev, tagName]);
    }
    setTagSearch("");
    setShowTagDropdown(false);
  }

  function removeTag(tagName: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== tagName));
  }

  // Filter available tags based on search, excluding already selected
  const filteredTags = availableTags.filter(
    (t) =>
      !selectedTags.includes(t.name) &&
      (t.displayName.toLowerCase().includes(tagSearch.toLowerCase()) ||
        t.name.toLowerCase().includes(tagSearch.toLowerCase()))
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Media</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex justify-center">
            <img
              src={item.blobUrl}
              alt={item.altText || item.fileName}
              className="max-h-40 rounded-md object-contain"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fileName">File Name</Label>
            <Input
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Image name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="altText">Alt Text</Label>
            <Input
              id="altText"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe this image for accessibility"
            />
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            {/* Selected tags */}
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {/* Searchable tag input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tagSearch}
                onChange={(e) => {
                  setTagSearch(e.target.value);
                  setShowTagDropdown(true);
                }}
                onFocus={() => setShowTagDropdown(true)}
                placeholder="Search tags to add..."
                className="pl-9"
              />
              {/* Dropdown */}
              {showTagDropdown && (tagSearch || filteredTags.length > 0) && (
                <div className="absolute z-50 w-full mt-1 bg-card text-card-foreground border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredTags.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No matching tags found
                    </div>
                  ) : (
                    filteredTags.slice(0, 20).map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                        onClick={() => addTag(tag.name)}
                      >
                        <span>{tag.displayName}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {/* Click outside to close dropdown */}
            {showTagDropdown && (
              <div
                className="fixed inset-0 z-0"
                onClick={() => setShowTagDropdown(false)}
              />
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="reusable"
              checked={reusable}
              onCheckedChange={setReusable}
            />
            <Label htmlFor="reusable">
              Available in media picker (reusable)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
