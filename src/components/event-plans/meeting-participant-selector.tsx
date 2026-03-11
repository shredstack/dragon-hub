"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { inviteParticipants } from "@/actions/event-plan-meetings";

interface MeetingParticipantSelectorProps {
  meetingId: string;
  existingParticipantIds: string[];
  members: { userId: string; userName: string; userEmail: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MeetingParticipantSelector({
  meetingId,
  existingParticipantIds,
  members,
  open,
  onOpenChange,
}: MeetingParticipantSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter to show only members not already invited
  const availableMembers = members.filter(
    (m) => !existingParticipantIds.includes(m.userId)
  );

  const toggleMember = (userId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === availableMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableMembers.map((m) => m.userId)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return;

    setIsSubmitting(true);
    try {
      await inviteParticipants(meetingId, Array.from(selectedIds));
      setSelectedIds(new Set());
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to invite participants:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Participants</DialogTitle>
        </DialogHeader>

        {availableMembers.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            All event plan members have already been invited.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Select members to invite to this meeting
              </p>
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                {selectedIds.size === availableMembers.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {availableMembers.map((member) => {
                const isSelected = selectedIds.has(member.userId);
                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => toggleMember(member.userId)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{member.userName}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.userEmail}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedIds.size === 0 || isSubmitting}
          >
            {isSubmitting
              ? "Inviting..."
              : `Invite ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
