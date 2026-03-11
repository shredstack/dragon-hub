"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { createMeeting, updateMeeting } from "@/actions/event-plan-meetings";
import type { FormattedMeeting } from "./event-plan-meetings";

interface MeetingFormProps {
  eventPlanId: string;
  meeting?: FormattedMeeting | null;
  members: { userId: string; userName: string; userEmail: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Generate time options in 15-minute intervals
const timeOptions: string[] = [];
for (let hour = 0; hour < 24; hour++) {
  for (let minute = 0; minute < 60; minute += 15) {
    const h = hour % 12 || 12;
    const ampm = hour < 12 ? "AM" : "PM";
    const m = minute.toString().padStart(2, "0");
    timeOptions.push(`${h}:${m} ${ampm}`);
  }
}

export function MeetingForm({
  eventPlanId,
  meeting,
  members: _members, // Reserved for future: initial participant selection
  open,
  onOpenChange,
}: MeetingFormProps) {
  const isEditing = !!meeting;

  const [title, setTitle] = useState(meeting?.title || "");
  const [description, setDescription] = useState(meeting?.description || "");
  const [location, setLocation] = useState(meeting?.location || "");
  const [meetingRoom, setMeetingRoom] = useState(meeting?.meetingRoom || "");
  const [meetingDate, setMeetingDate] = useState(
    meeting?.meetingDate
      ? new Date(meeting.meetingDate).toISOString().split("T")[0]
      : ""
  );
  const [startTime, setStartTime] = useState(meeting?.startTime || "7:00 PM");
  const [endTime, setEndTime] = useState(meeting?.endTime || "");
  const [topic, setTopic] = useState(meeting?.topic || "");
  const [agenda, setAgenda] = useState(meeting?.agenda || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when meeting changes
  const meetingId = meeting?.id;
  const [lastMeetingId, setLastMeetingId] = useState(meetingId);
  if (meetingId !== lastMeetingId) {
    setLastMeetingId(meetingId);
    setTitle(meeting?.title || "");
    setDescription(meeting?.description || "");
    setLocation(meeting?.location || "");
    setMeetingRoom(meeting?.meetingRoom || "");
    setMeetingDate(
      meeting?.meetingDate
        ? new Date(meeting.meetingDate).toISOString().split("T")[0]
        : ""
    );
    setStartTime(meeting?.startTime || "7:00 PM");
    setEndTime(meeting?.endTime || "");
    setTopic(meeting?.topic || "");
    setAgenda(meeting?.agenda || "");
    setError(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!location.trim()) {
      setError("Address/Location is required");
      return;
    }
    if (!meetingDate) {
      setError("Date is required");
      return;
    }
    if (!topic.trim()) {
      setError("Topic is required");
      return;
    }

    setIsSubmitting(true);
    try {
      // Send the date string as YYYY-MM-DD - the server will handle timezone correctly
      if (isEditing && meeting) {
        await updateMeeting(meeting.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim(),
          meetingRoom: meetingRoom.trim() || undefined,
          meetingDate,
          startTime,
          endTime: endTime || undefined,
          topic: topic.trim(),
          agenda: agenda.trim() || undefined,
        });
      } else {
        await createMeeting(eventPlanId, {
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim(),
          meetingRoom: meetingRoom.trim() || undefined,
          meetingDate,
          startTime,
          endTime: endTime || undefined,
          topic: topic.trim(),
          agenda: agenda.trim() || undefined,
        });
      }

      // Reset form and close
      setTitle("");
      setDescription("");
      setLocation("");
      setMeetingRoom("");
      setMeetingDate("");
      setStartTime("7:00 PM");
      setEndTime("");
      setTopic("");
      setAgenda("");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save meeting:", err);
      setError(err instanceof Error ? err.message : "Failed to save meeting");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Meeting" : "Schedule Meeting"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Initial Planning Meeting"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meetingDate">Date *</Label>
              <Input
                id="meetingDate"
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time *</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endTime">End Time (optional)</Label>
            <Select
              value={endTime || "none"}
              onValueChange={(val) => setEndTime(val === "none" ? "" : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select end time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No end time</SelectItem>
                {timeOptions.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="location">Address / Location *</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Dragon Elementary School"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meetingRoom">Room (optional)</Label>
              <Input
                id="meetingRoom"
                value={meetingRoom}
                onChange={(e) => setMeetingRoom(e.target.value)}
                placeholder="e.g., Library, Room 101"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="topic">Topic *</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Primary purpose of the meeting"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context about the meeting"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda">Agenda (optional)</Label>
            <Textarea
              id="agenda"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Meeting agenda items (supports plain text)"
              rows={4}
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
              {isSubmitting
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Schedule Meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
