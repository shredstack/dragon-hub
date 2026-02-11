"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronDown,
  ChevronUp,
  Trophy,
  Folder,
  Lightbulb,
  Users,
  Link2,
  Calendar,
} from "lucide-react";
import type { BoardHandoffNoteWithUsers } from "@/types";

interface HandoffNotePreviewProps {
  note: BoardHandoffNoteWithUsers;
}

export function HandoffNotePreview({ note }: HandoffNotePreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const fromName = note.fromUser?.name || note.fromUser?.email || "Unknown";

  // Check if note has any content
  const hasContent =
    note.keyAccomplishments ||
    note.ongoingProjects ||
    note.tipsAndAdvice ||
    note.importantContacts ||
    note.filesAndResources;

  if (!hasContent) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-500/10 p-2 text-amber-500">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{note.schoolYear}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Notes from {fromName}
              </p>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Key Accomplishments */}
          {note.keyAccomplishments && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Trophy className="h-4 w-4 text-amber-500" />
                Key Accomplishments
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                {note.keyAccomplishments}
              </p>
            </div>
          )}

          {/* Ongoing Projects */}
          {note.ongoingProjects && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Folder className="h-4 w-4 text-blue-500" />
                Ongoing Projects
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                {note.ongoingProjects}
              </p>
            </div>
          )}

          {/* Tips and Advice */}
          {note.tipsAndAdvice && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                Tips & Advice
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                {note.tipsAndAdvice}
              </p>
            </div>
          )}

          {/* Important Contacts */}
          {note.importantContacts && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-green-500" />
                Important Contacts
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                {note.importantContacts}
              </p>
            </div>
          )}

          {/* Files and Resources */}
          {note.filesAndResources && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="h-4 w-4 text-purple-500" />
                Files & Resources
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                {note.filesAndResources}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
