"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HandoffNoteCard } from "./handoff-note-card";
import { HandoffNoteForm } from "./handoff-note-form";
import { Plus, X, FileText } from "lucide-react";
import type { BoardHandoffNoteForViewer } from "@/types";

interface HandoffNotesPanelProps {
  notes: BoardHandoffNoteForViewer[];
  positionLabel: string;
  schoolYear: string;
}

/**
 * The position's full handoff history plus the composer for adding to it.
 *
 * Composer and list live in one client component so a freshly created note —
 * especially an AI draft — can open straight into edit mode for review.
 */
export function HandoffNotesPanel({
  notes,
  positionLabel,
  schoolYear,
}: HandoffNotesPanelProps) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(notes.length === 0);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const handleCreated = (noteId: string) => {
    setComposerOpen(false);
    // Drop the new note straight into edit mode so the author reviews it
    // before it stands as their handoff — this is the AI draft's review step.
    setEditingNoteId(noteId || null);
    router.refresh();
  };

  const handleChanged = () => {
    setEditingNoteId(null);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      {/* Composer */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add a handoff note</h2>
            <p className="text-sm text-muted-foreground">
              Notes are added to the history for {schoolYear} — writing a new one
              never overwrites an existing note.
            </p>
          </div>
          <Button
            type="button"
            variant={composerOpen ? "ghost" : "default"}
            onClick={() => setComposerOpen(!composerOpen)}
            className="shrink-0"
          >
            {composerOpen ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Close
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                New Note
              </>
            )}
          </Button>
        </div>

        {composerOpen && (
          <HandoffNoteForm
            onSaved={handleCreated}
            onCancel={() => setComposerOpen(false)}
          />
        )}
      </div>

      {/* History */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            All {positionLabel} handoff notes
          </h2>
          <p className="text-sm text-muted-foreground">
            {notes.length === 0
              ? "No notes yet — yours will be the first."
              : `${notes.length} note${notes.length === 1 ? "" : "s"}, newest first. Every note ever written for this role is kept.`}
          </p>
        </div>

        {notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nobody has left a handoff note for this position yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note, index) => (
              <HandoffNoteCard
                key={note.id}
                note={note}
                isLatest={index === 0}
                isEditing={editingNoteId === note.id}
                onEdit={() => setEditingNoteId(note.id)}
                onCancelEdit={() => setEditingNoteId(null)}
                onChanged={handleChanged}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
