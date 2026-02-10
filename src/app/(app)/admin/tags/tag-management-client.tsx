"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createTag,
  updateTag,
  deleteTag,
  mergeTags,
} from "@/actions/tags";
import { Trash2, Edit2, Check, X, Merge, Plus } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  displayName: string;
  usageCount: number;
  createdAt: Date | null;
}

interface TagManagementClientProps {
  tags: Tag[];
}

export function TagManagementClient({ tags }: TagManagementClientProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    setLoading(true);
    try {
      await createTag(newTagName);
      setNewTagName("");
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create tag");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (tagId: string) => {
    if (!editValue.trim()) return;
    setLoading(true);
    try {
      await updateTag(tagId, editValue);
      setEditingId(null);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update tag");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (tagId: string, displayName: string) => {
    if (
      !confirm(
        `Delete tag "${displayName}"? This won't remove the tag from existing content.`
      )
    )
      return;
    setLoading(true);
    try {
      await deleteTag(tagId);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete tag");
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async (targetTagId: string) => {
    if (!mergeSource) return;
    const sourceTag = tags.find((t) => t.id === mergeSource);
    const targetTag = tags.find((t) => t.id === targetTagId);
    if (
      !confirm(
        `Merge "${sourceTag?.displayName}" into "${targetTag?.displayName}"? All content with the source tag will be updated to use the target tag.`
      )
    )
      return;
    setLoading(true);
    try {
      await mergeTags(mergeSource, targetTagId);
      setMergeMode(false);
      setMergeSource(null);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to merge tags");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditValue(tag.displayName);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  return (
    <div className="space-y-6">
      {/* Create New Tag */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 font-medium">Add New Tag</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Enter tag name..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={loading || !newTagName.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Tag
          </Button>
        </div>
      </div>

      {/* Merge Mode Toggle */}
      <div className="flex items-center gap-4">
        <Button
          variant={mergeMode ? "default" : "outline"}
          onClick={() => {
            setMergeMode(!mergeMode);
            setMergeSource(null);
          }}
        >
          <Merge className="mr-2 h-4 w-4" />
          {mergeMode ? "Cancel Merge" : "Merge Tags"}
        </Button>
        {mergeMode && (
          <p className="text-sm text-muted-foreground">
            {mergeSource
              ? "Now click the target tag to merge into"
              : "Click a tag to select it as the source"}
          </p>
        )}
      </div>

      {/* Tags Table */}
      {tags.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-8 text-center">
          <p className="text-muted-foreground">
            No tags yet. Tags will be created automatically when AI analyzes
            content, or you can add them manually above.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Tag</th>
                  <th className="p-3">Usage Count</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr
                    key={tag.id}
                    className={`border-b border-border ${
                      mergeMode && mergeSource === tag.id
                        ? "bg-primary/10"
                        : ""
                    } ${
                      mergeMode && mergeSource && mergeSource !== tag.id
                        ? "cursor-pointer hover:bg-muted"
                        : ""
                    }`}
                    onClick={() => {
                      if (mergeMode && mergeSource && mergeSource !== tag.id) {
                        handleMerge(tag.id);
                      } else if (mergeMode && !mergeSource) {
                        setMergeSource(tag.id);
                      }
                    }}
                  >
                    <td className="p-3">
                      {editingId === tag.id ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdate(tag.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <Badge variant="secondary">{tag.displayName}</Badge>
                      )}
                    </td>
                    <td className="p-3">{tag.usageCount}</td>
                    <td className="p-3 text-muted-foreground">
                      {tag.createdAt
                        ? new Date(tag.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      {!mergeMode && (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {editingId === tag.id ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdate(tag.id)}
                                disabled={loading}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(tag)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  handleDelete(tag.id, tag.displayName)
                                }
                                disabled={loading}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
