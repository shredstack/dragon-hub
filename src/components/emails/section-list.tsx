"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, GripVertical, Pencil, Trash2, Loader2, Globe, Lock } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SectionEditor } from "./section-editor";
import {
  reorderEmailSections,
  deleteEmailSection,
  addEmailSection,
} from "@/actions/email-campaigns";
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

interface SectionListProps {
  campaignId: string;
  sections: SectionData[];
  onSectionsChange: (sections: SectionData[]) => void;
  isReadOnly?: boolean;
}

export function SectionList({
  campaignId,
  sections,
  onSectionsChange,
  isReadOnly,
}: SectionListProps) {
  const [editingSection, setEditingSection] = useState<SectionData | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    const newSections = arrayMove(sections, oldIndex, newIndex);

    // Optimistic update
    onSectionsChange(newSections);

    // Persist to server
    try {
      await reorderEmailSections(
        campaignId,
        newSections.map((s) => s.id)
      );
    } catch (error) {
      console.error("Failed to reorder sections:", error);
      // Revert on error
      onSectionsChange(sections);
    }
  }

  async function handleDelete(sectionId: string) {
    if (!confirm("Delete this section?")) return;

    setDeletingId(sectionId);
    try {
      await deleteEmailSection(sectionId);
      onSectionsChange(sections.filter((s) => s.id !== sectionId));
    } catch (error) {
      console.error("Failed to delete section:", error);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddSection() {
    setIsAddingSection(true);
    try {
      const section = await addEmailSection(campaignId, {
        title: "New Section",
        body: "<p>Enter content here...</p>",
        audience: "all",
      });
      // Update local state with the new section
      onSectionsChange([...sections, section as SectionData]);
    } catch (error) {
      console.error("Failed to add section:", error);
    } finally {
      setIsAddingSection(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Sections ({sections.length})</h2>
        {!isReadOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddSection}
            disabled={isAddingSection}
          >
            {isAddingSection ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {sections.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No sections yet. Add a section or regenerate with AI.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sections.map((section) => (
                <SortableSection
                  key={section.id}
                  section={section}
                  onEdit={() => setEditingSection(section)}
                  onDelete={() => handleDelete(section.id)}
                  isDeleting={deletingId === section.id}
                  isReadOnly={isReadOnly}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editingSection && (
        <SectionEditor
          campaignId={campaignId}
          section={editingSection}
          onClose={() => setEditingSection(null)}
          onSave={(updated) => {
            onSectionsChange(
              sections.map((s) => (s.id === updated.id ? updated : s))
            );
            setEditingSection(null);
          }}
        />
      )}
    </div>
  );
}

interface SortableSectionProps {
  section: SectionData;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  isReadOnly?: boolean;
}

function SortableSection({
  section,
  onEdit,
  onDelete,
  isDeleting,
  isReadOnly,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: isReadOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
    >
      {!isReadOnly && (
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium line-clamp-2">
            {section.title || "(No title)"}
          </h3>
          <div className="flex-shrink-0">
            {section.audience === "pta_only" ? (
              <Badge variant="outline" className="text-xs">
                <Lock className="mr-1 h-3 w-3" />
                PTA
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                <Globe className="mr-1 h-3 w-3" />
                All
              </Badge>
            )}
          </div>
        </div>

        {!isReadOnly && (
          <div className="mt-2 flex gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="text-red-600 hover:text-red-700"
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
