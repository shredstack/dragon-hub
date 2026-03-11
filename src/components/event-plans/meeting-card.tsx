"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Users,
  FileText,
  Pencil,
  Trash2,
  Check,
  X,
  HelpCircle,
  UserPlus,
  Download,
  Loader2,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  deleteMeeting,
  updateMeetingRsvp,
} from "@/actions/event-plan-meetings";
import { MeetingNotesEditor } from "./meeting-notes-editor";
import { MeetingNotesViewer } from "./meeting-notes-viewer";
import { MeetingParticipantSelector } from "./meeting-participant-selector";
import type { FormattedMeeting } from "./event-plan-meetings";
import type { MeetingRsvpStatus } from "@/types";

interface MeetingCardProps {
  meeting: FormattedMeeting;
  eventPlanId: string;
  currentUserId: string;
  canManage: boolean;
  canInteract: boolean;
  onEdit: () => void;
  members: { userId: string; userName: string; userEmail: string }[];
}

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const rsvpIcons: Record<MeetingRsvpStatus, React.ReactNode> = {
  accepted: <Check className="h-3 w-3 text-green-600" />,
  declined: <X className="h-3 w-3 text-red-600" />,
  tentative: <HelpCircle className="h-3 w-3 text-yellow-600" />,
  invited: null,
};

export function MeetingCard({
  meeting,
  eventPlanId,
  currentUserId,
  canManage,
  canInteract,
  onEdit,
  members,
}: MeetingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [showNotesViewer, setShowNotesViewer] = useState(false);
  const [showParticipantSelector, setShowParticipantSelector] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingRsvp, setIsUpdatingRsvp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const meetingDate = new Date(meeting.meetingDate);
  const formattedDate = meetingDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const isPast = meetingDate < new Date() || meeting.status === "completed";
  const hasNotes = meeting.notes && meeting.notes.length > 0;

  // Find current user's RSVP status
  const currentUserParticipant = meeting.participants.find(
    (p) => p.userId === currentUserId
  );
  const currentUserRsvp = currentUserParticipant?.rsvpStatus;
  const isParticipant = !!currentUserParticipant;

  // Count RSVPs
  const acceptedCount = meeting.participants.filter(
    (p) => p.rsvpStatus === "accepted"
  ).length;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMeeting(meeting.id);
    } catch (error) {
      console.error("Failed to delete meeting:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleRsvp = async (status: MeetingRsvpStatus) => {
    setIsUpdatingRsvp(true);
    try {
      await updateMeetingRsvp(meeting.id, status);
    } catch (error) {
      console.error("Failed to update RSVP:", error);
    } finally {
      setIsUpdatingRsvp(false);
    }
  };

  const handleDownload = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const response = await fetch(
        `/api/download/meeting-notes-doc?meetingId=${meeting.id}`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to download document");
      }
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "meeting-notes.docx";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }
      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download notes:", error);
      setExportError(
        error instanceof Error ? error.message : "Failed to download notes"
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        {/* Collapsed View */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{meeting.title}</h3>
              <Badge
                variant="secondary"
                className={statusColors[meeting.status]}
              >
                {meeting.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {meeting.startTime}
                {meeting.endTime && ` – ${meeting.endTime}`}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {meeting.location}
                {meeting.meetingRoom && ` (${meeting.meetingRoom})`}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {acceptedCount} attending
              </span>
              {hasNotes && (
                <span className="flex items-center gap-1 text-green-600">
                  <FileText className="h-3.5 w-3.5" />
                  Notes
                </span>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {/* Expanded View */}
        {expanded && (
          <div className="border-t border-border p-4">
            {/* Topic */}
            <div className="mb-4">
              <p className="text-sm font-medium text-muted-foreground">Topic</p>
              <p>{meeting.topic}</p>
            </div>

            {/* Description */}
            {meeting.description && (
              <div className="mb-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Description
                </p>
                <p className="text-sm">{meeting.description}</p>
              </div>
            )}

            {/* Agenda */}
            {meeting.agenda && (
              <div className="mb-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Agenda
                </p>
                <p className="whitespace-pre-wrap text-sm">{meeting.agenda}</p>
              </div>
            )}

            {/* Participants */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">
                  Participants ({meeting.participants.length})
                </p>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowParticipantSelector(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                    Invite
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {meeting.participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs"
                  >
                    {rsvpIcons[p.rsvpStatus]}
                    <span>{p.user.name || p.user.email}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RSVP Buttons (for participants) */}
            {isParticipant && !isPast && meeting.status === "scheduled" && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Your RSVP
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={currentUserRsvp === "accepted" ? "default" : "outline"}
                    onClick={() => handleRsvp("accepted")}
                    disabled={isUpdatingRsvp}
                  >
                    <Check className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant={currentUserRsvp === "tentative" ? "default" : "outline"}
                    onClick={() => handleRsvp("tentative")}
                    disabled={isUpdatingRsvp}
                  >
                    <HelpCircle className="h-4 w-4" />
                    Maybe
                  </Button>
                  <Button
                    size="sm"
                    variant={currentUserRsvp === "declined" ? "default" : "outline"}
                    onClick={() => handleRsvp("declined")}
                    disabled={isUpdatingRsvp}
                  >
                    <X className="h-4 w-4" />
                    Decline
                  </Button>
                </div>
              </div>
            )}

            {/* Notes Preview */}
            {hasNotes && (
              <div className="mb-4 rounded-lg bg-muted/50 p-3">
                <p className="mb-1 text-sm font-medium">Meeting Notes</p>
                <div
                  className="prose prose-sm dark:prose-invert line-clamp-3"
                  dangerouslySetInnerHTML={{
                    __html: meeting.notes[0].content,
                  }}
                />
              </div>
            )}

            {/* Export Error */}
            {exportError && (
              <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {exportError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {/* View Notes (anyone can view if notes exist) */}
              {hasNotes && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNotesViewer(true)}
                >
                  <Eye className="h-4 w-4" />
                  View Notes
                </Button>
              )}
              {/* Add/Edit Notes (requires canInteract) */}
              {canInteract && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNotesEditor(true)}
                >
                  <FileText className="h-4 w-4" />
                  {hasNotes ? "Edit Notes" : "Add Notes"}
                </Button>
              )}
              {/* Download as Word Doc */}
              {canManage && hasNotes && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {isExporting ? "Downloading..." : "Download as Doc"}
                </Button>
              )}
              {canManage && (
                <>
                  <Button size="sm" variant="outline" onClick={onEdit}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Meeting</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{meeting.title}&rdquo;? This will also
            delete all meeting notes and participant data. This action cannot
            be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Editor Dialog */}
      <MeetingNotesEditor
        meetingId={meeting.id}
        eventPlanId={eventPlanId}
        meetingTitle={meeting.title}
        topic={meeting.topic}
        agenda={meeting.agenda ?? undefined}
        initialNotes={meeting.notes[0] || null}
        participants={meeting.participants}
        schoolMembers={members}
        open={showNotesEditor}
        onOpenChange={setShowNotesEditor}
      />

      {/* Notes Viewer Dialog */}
      {hasNotes && (
        <MeetingNotesViewer
          meetingTitle={meeting.title}
          notes={meeting.notes[0]}
          open={showNotesViewer}
          onOpenChange={setShowNotesViewer}
        />
      )}

      {/* Participant Selector Dialog */}
      <MeetingParticipantSelector
        meetingId={meeting.id}
        existingParticipantIds={meeting.participants.map((p) => p.userId)}
        members={members}
        open={showParticipantSelector}
        onOpenChange={setShowParticipantSelector}
      />
    </>
  );
}
