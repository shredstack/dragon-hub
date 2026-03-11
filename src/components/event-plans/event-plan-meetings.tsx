"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, CalendarClock } from "lucide-react";
import { MeetingCard } from "./meeting-card";
import { MeetingForm } from "./meeting-form";
import type { MeetingStatus, MeetingRsvpStatus } from "@/types";

export interface FormattedMeeting {
  id: string;
  title: string;
  description: string | null;
  location: string;
  meetingRoom: string | null;
  meetingDate: string;
  startTime: string;
  endTime: string | null;
  topic: string;
  agenda: string | null;
  status: MeetingStatus;
  googleDocUrl: string | null;
  createdBy: string;
  creator: { name: string | null; email: string } | null;
  participants: {
    id: string;
    userId: string;
    rsvpStatus: MeetingRsvpStatus;
    user: { id: string; name: string | null; email: string };
  }[];
  notes: {
    id: string;
    content: string;
    summary: string | null;
    actionItems: string | null;
    attendees: string | null;
  }[];
}

interface EventPlanMeetingsProps {
  eventPlanId: string;
  meetings: FormattedMeeting[];
  members: { userId: string; userName: string; userEmail: string }[];
  currentUserId: string;
  canCreate: boolean;
  canManage: boolean;
}

export function EventPlanMeetings({
  eventPlanId,
  meetings,
  members,
  currentUserId,
  canCreate,
  canManage,
}: EventPlanMeetingsProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<FormattedMeeting | null>(
    null
  );
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");

  const now = new Date();

  // Separate meetings into upcoming and past
  const sortedMeetings = [...meetings].sort(
    (a, b) => new Date(a.meetingDate).getTime() - new Date(b.meetingDate).getTime()
  );

  const upcomingMeetings = sortedMeetings.filter(
    (m) =>
      new Date(m.meetingDate) >= now &&
      m.status !== "completed" &&
      m.status !== "cancelled"
  );

  const pastMeetings = sortedMeetings.filter(
    (m) =>
      new Date(m.meetingDate) < now ||
      m.status === "completed" ||
      m.status === "cancelled"
  );

  const filteredMeetings =
    filter === "upcoming"
      ? upcomingMeetings
      : filter === "past"
        ? pastMeetings
        : sortedMeetings;

  const handleEdit = (meeting: FormattedMeeting) => {
    setEditingMeeting(meeting);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingMeeting(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Meetings</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {meetings.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex rounded-md border border-border">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 text-xs transition-colors ${
                filter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("upcoming")}
              className={`border-l border-border px-3 py-1.5 text-xs transition-colors ${
                filter === "upcoming"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Upcoming ({upcomingMeetings.length})
            </button>
            <button
              onClick={() => setFilter("past")}
              className={`border-l border-border px-3 py-1.5 text-xs transition-colors ${
                filter === "past"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Past ({pastMeetings.length})
            </button>
          </div>
          {canCreate && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Schedule Meeting</span>
            </Button>
          )}
        </div>
      </div>

      {/* Meeting List */}
      {filteredMeetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-1 font-medium">No meetings scheduled</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {filter === "upcoming"
              ? "No upcoming meetings. Schedule one to get started."
              : filter === "past"
                ? "No past meetings yet."
                : "Schedule a meeting to coordinate with your team."}
          </p>
          {canCreate && filter !== "past" && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4" />
              Schedule Meeting
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              eventPlanId={eventPlanId}
              currentUserId={currentUserId}
              canManage={canManage}
              canInteract={canCreate}
              onEdit={() => handleEdit(meeting)}
              members={members}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <MeetingForm
        eventPlanId={eventPlanId}
        meeting={editingMeeting}
        members={members}
        open={showForm}
        onOpenChange={handleCloseForm}
      />
    </div>
  );
}
