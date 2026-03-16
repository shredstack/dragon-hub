"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, CheckSquare } from "lucide-react";
import type { MeetingActionItem } from "@/types";

interface MeetingNotesViewerProps {
  meetingTitle: string;
  notes: {
    id: string;
    content: string;
    summary: string | null;
    actionItems: string | null;
    attendees: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MeetingNotesViewer({
  meetingTitle,
  notes,
  open,
  onOpenChange,
}: MeetingNotesViewerProps) {
  // Parse attendees
  const attendees: string[] = notes.attendees
    ? (() => {
        try {
          const parsed = JSON.parse(notes.attendees);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
    : [];

  // Parse action items
  const actionItems: MeetingActionItem[] = notes.actionItems
    ? (() => {
        try {
          const parsed = JSON.parse(notes.actionItems);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{meetingTitle} — Notes</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Attendees */}
          {attendees.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                Attendees
              </div>
              <div className="flex flex-wrap gap-2">
                {attendees.map((name, index) => (
                  <Badge key={index} variant="secondary">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {notes.summary && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                Summary
              </h3>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm">{notes.summary}</p>
              </div>
            </div>
          )}

          {/* Notes Content */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              Meeting Notes
            </h3>
            <div
              className="meeting-notes prose prose-sm dark:prose-invert max-w-none rounded-lg border border-border bg-card p-4"
              dangerouslySetInnerHTML={{ __html: notes.content }}
            />
          </div>

          {/* Action Items */}
          {actionItems.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CheckSquare className="h-4 w-4" />
                Action Items
              </div>
              <div className="space-y-2">
                {actionItems.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <p className="font-medium">{item.text}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {(item.assigneeName || item.assigneeId) && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.assigneeName || item.assigneeId}
                        </span>
                      )}
                      {item.deadline && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(item.deadline + "T12:00:00Z").toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
