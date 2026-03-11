"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { saveMeetingNotes } from "@/actions/event-plan-meetings";
import { WhiteboardCapture } from "./whiteboard-capture";
import type { MeetingActionItem, MeetingRsvpStatus } from "@/types";

interface MeetingNotesEditorProps {
  meetingId: string;
  eventPlanId: string;
  meetingTitle: string;
  topic: string;
  agenda?: string;
  initialNotes: {
    id: string;
    content: string;
    summary: string | null;
    actionItems: string | null;
    attendees: string | null;
  } | null;
  participants: {
    id: string;
    userId: string;
    rsvpStatus: MeetingRsvpStatus;
    user: { id: string; name: string | null; email: string };
  }[];
  schoolMembers: { userId: string; userName: string; userEmail: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MeetingNotesEditor({
  meetingId,
  eventPlanId,
  meetingTitle,
  topic,
  agenda,
  initialNotes,
  participants,
  schoolMembers,
  open,
  onOpenChange,
}: MeetingNotesEditorProps) {
  // Parse initial action items (handles both old and new formats)
  const parseActionItems = (json: string | null): MeetingActionItem[] => {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];

      // Convert old format (assignee string) to new format (assigneeId/assigneeName)
      return parsed.map((item: MeetingActionItem & { assignee?: string }) => {
        // If old format with `assignee` string, convert to assigneeName
        if (item.assignee && !item.assigneeId && !item.assigneeName) {
          return {
            text: item.text,
            assigneeName: item.assignee,
            deadline: item.deadline,
          };
        }
        return item;
      });
    } catch {
      return [];
    }
  };

  // Parse initial attendees
  const parseAttendees = (json: string | null): string[] => {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Strip HTML for editing (simple approach - just show plain text)
  const htmlToText = (html: string): string => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  };

  // Convert plain text to simple HTML paragraphs
  const textToHtml = (text: string): string => {
    return text
      .split("\n\n")
      .filter((p) => p.trim())
      .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");
  };

  const [content, setContent] = useState(
    initialNotes?.content ? htmlToText(initialNotes.content) : ""
  );
  const [summary, setSummary] = useState(initialNotes?.summary || "");
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>(
    parseActionItems(initialNotes?.actionItems ?? null)
  );
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>(
    parseAttendees(initialNotes?.attendees ?? null)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when notes change
  const notesId = initialNotes?.id;
  const [lastNotesId, setLastNotesId] = useState(notesId);
  if (notesId !== lastNotesId) {
    setLastNotesId(notesId);
    setContent(initialNotes?.content ? htmlToText(initialNotes.content) : "");
    setSummary(initialNotes?.summary || "");
    setActionItems(parseActionItems(initialNotes?.actionItems ?? null));
    setSelectedAttendees(parseAttendees(initialNotes?.attendees ?? null));
    setError(null);
  }

  const handleAddActionItem = () => {
    setActionItems([...actionItems, { text: "" }]);
  };

  const handleRemoveActionItem = (index: number) => {
    setActionItems(actionItems.filter((_, i) => i !== index));
  };

  const handleActionItemChange = (
    index: number,
    field: keyof MeetingActionItem,
    value: string
  ) => {
    const updated = [...actionItems];
    updated[index] = { ...updated[index], [field]: value };
    setActionItems(updated);
  };

  const handleAssigneeChange = (index: number, userId: string) => {
    const updated = [...actionItems];
    if (userId === "none") {
      // Clear assignee
      updated[index] = {
        ...updated[index],
        assigneeId: undefined,
        assigneeName: undefined,
      };
    } else {
      // Find the member to get their name
      const member = schoolMembers.find((m) => m.userId === userId);
      updated[index] = {
        ...updated[index],
        assigneeId: userId,
        assigneeName: member?.userName || member?.userEmail || undefined,
      };
    }
    setActionItems(updated);
  };

  const toggleAttendee = (name: string) => {
    setSelectedAttendees((prev) =>
      prev.includes(name)
        ? prev.filter((a) => a !== name)
        : [...prev, name]
    );
  };

  const handleWhiteboardInsert = (
    capturedContent: string,
    capturedActionItems: MeetingActionItem[]
  ) => {
    // Append captured content to existing notes
    const separator = content.trim() ? "\n\n" : "";

    // For display, we need to convert existing content to text and append
    // The captured content is HTML, so we'll convert it to text for the textarea
    const capturedText = capturedContent
      .replace(/<[^>]*>/g, "")  // Strip HTML tags for textarea display
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();

    setContent(content.trim() + separator + capturedText);

    // Merge action items (avoid duplicates by checking text)
    if (capturedActionItems.length > 0) {
      const existingTexts = new Set(actionItems.map((item) => item.text.toLowerCase()));
      const newItems = capturedActionItems.filter(
        (item) => !existingTexts.has(item.text.toLowerCase())
      );
      if (newItems.length > 0) {
        setActionItems([...actionItems, ...newItems]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError("Notes content is required");
      return;
    }

    setIsSubmitting(true);
    try {
      // Filter out empty action items
      const validActionItems = actionItems.filter((item) => item.text.trim());

      await saveMeetingNotes(meetingId, {
        content: textToHtml(content.trim()),
        summary: summary.trim() || undefined,
        actionItems:
          validActionItems.length > 0
            ? JSON.stringify(validActionItems)
            : undefined,
        attendees:
          selectedAttendees.length > 0
            ? JSON.stringify(selectedAttendees)
            : undefined,
      });

      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save notes:", err);
      setError(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Meeting Notes</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Attendees */}
          <div className="space-y-2">
            <Label>Attendees</Label>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => {
                const name = p.user.name || p.user.email;
                const isSelected = selectedAttendees.includes(name);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleAttendee(name)}
                    className={`rounded-full px-3 py-1 text-sm transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Click to mark who attended the meeting
            </p>
          </div>

          {/* Notes Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Notes *</Label>
              <WhiteboardCapture
                meetingId={meetingId}
                eventPlanId={eventPlanId}
                meetingTitle={meetingTitle}
                topic={topic}
                agenda={agenda}
                onInsert={handleWhiteboardInsert}
              />
            </div>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Meeting notes, discussion points, decisions made..."
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use blank lines to separate paragraphs. Use &ldquo;Scan Notes&rdquo; to capture
              whiteboard or handwritten content.
            </p>
          </div>

          {/* Action Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Action Items</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddActionItem}
              >
                <Plus className="h-4 w-4" />
                Add Item
              </Button>
            </div>
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No action items yet. Click &ldquo;Add Item&rdquo; to create one.
              </p>
            ) : (
              <div className="space-y-3">
                {actionItems.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border bg-muted/30 p-3"
                  >
                    <div className="mb-2 flex gap-2">
                      <Input
                        value={item.text}
                        onChange={(e) =>
                          handleActionItemChange(index, "text", e.target.value)
                        }
                        placeholder="Action item description"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveActionItem(index)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="flex-1">
                        <Label className="mb-1 text-xs text-muted-foreground">
                          Assignee
                        </Label>
                        <Select
                          value={item.assigneeId || "none"}
                          onValueChange={(value) =>
                            handleAssigneeChange(index, value)
                          }
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select assignee" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {schoolMembers.map((member) => (
                              <SelectItem
                                key={member.userId}
                                value={member.userId}
                              >
                                {member.userName || member.userEmail}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-full sm:w-40">
                        <Label className="mb-1 text-xs text-muted-foreground">
                          Deadline
                        </Label>
                        <Input
                          type="date"
                          value={item.deadline || ""}
                          onChange={(e) =>
                            handleActionItemChange(
                              index,
                              "deadline",
                              e.target.value
                            )
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <Label htmlFor="summary">Summary (optional)</Label>
            <Textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Brief summary of key decisions and outcomes"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Notes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
