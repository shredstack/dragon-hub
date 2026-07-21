"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HandoffNoteForm } from "./handoff-note-form";
import { deleteHandoffNote } from "@/actions/handoff-notes";
import {
  ChevronDown,
  ChevronUp,
  Trophy,
  Folder,
  Lightbulb,
  Users,
  Link2,
  Calendar,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { BoardHandoffNoteForViewer } from "@/types";

interface HandoffNoteCardProps {
  note: BoardHandoffNoteForViewer;
  /** The newest note for this position — shown expanded and badged. */
  isLatest?: boolean;
  isEditing?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onChanged?: () => void;
}

const SECTIONS = [
  {
    key: "keyAccomplishments",
    label: "Key Accomplishments",
    icon: Trophy,
    color: "text-amber-500",
  },
  {
    key: "ongoingProjects",
    label: "Ongoing Projects",
    icon: Folder,
    color: "text-blue-500",
  },
  {
    key: "tipsAndAdvice",
    label: "Tips & Advice",
    icon: Lightbulb,
    color: "text-yellow-500",
  },
  {
    key: "importantContacts",
    label: "Important Contacts",
    icon: Users,
    color: "text-green-500",
  },
  {
    key: "filesAndResources",
    label: "Files & Resources",
    icon: Link2,
    color: "text-purple-500",
  },
] as const;

export function HandoffNoteCard({
  note,
  isLatest = false,
  isEditing = false,
  onEdit,
  onCancelEdit,
  onChanged,
}: HandoffNoteCardProps) {
  const [expanded, setExpanded] = useState(isLatest);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromName = note.fromUser?.name || note.fromUser?.email || "Unknown";

  const hasContent = SECTIONS.some((section) => note[section.key]);

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete this handoff note from ${note.schoolYear}? This can't be undone.`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    const result = await deleteHandoffNote(note.id);
    setIsDeleting(false);

    if (!result.success) {
      setError(result.error ?? "Failed to delete note");
      return;
    }
    onChanged?.();
  };

  if (isEditing) {
    return (
      <Card>
        <CardHeader>
          <p className="font-medium">
            Editing your {note.schoolYear} note
            {note.title ? ` — ${note.title}` : ""}
          </p>
        </CardHeader>
        <CardContent>
          <HandoffNoteForm
            note={note}
            onSaved={() => onChanged?.()}
            onCancel={onCancelEdit}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex flex-1 items-start gap-3 text-left"
          >
            <div className="mt-0.5 rounded-full bg-amber-500/10 p-2 text-amber-500">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {note.title || note.schoolYear}
                </span>
                {note.title && (
                  <span className="text-sm text-muted-foreground">
                    {note.schoolYear}
                  </span>
                )}
                {isLatest && <Badge variant="success">Most recent</Badge>}
                {note.source === "ai_generated" && (
                  <Badge variant="secondary">
                    <Sparkles className="mr-1 h-3 w-3" />
                    AI draft
                  </Badge>
                )}
                {note.isMine && <Badge variant="outline">Yours</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {fromName}
                {note.updatedAt
                  ? ` · updated ${new Date(note.updatedAt).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-1 self-end sm:self-start">
            {note.canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onEdit}
                aria-label="Edit note"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {note.canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                aria-label="Delete note"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse note" : "Expand note"}
            >
              {expanded ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {!hasContent && (
            <p className="text-sm text-muted-foreground">
              This note is empty.
            </p>
          )}
          {SECTIONS.map(({ key, label, icon: Icon, color }) => {
            const value = note[key];
            if (!value) return null;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className={`h-4 w-4 ${color}`} />
                  {label}
                </div>
                <p className="whitespace-pre-wrap pl-6 text-sm text-muted-foreground">
                  {value}
                </p>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
