"use client";

import { approveHours, rejectHours } from "@/actions/volunteer-hours";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";

export function ApprovalActions({ hourId }: { hourId: string }) {
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={() => {
          // A board member works through a stack of these in one sitting,
          // eyes on the next row rather than on the button. The tap-back is
          // the confirmation that the last one landed.
          haptic("success");
          void approveHours(hourId);
        }}
        className="bg-success text-success-foreground hover:bg-success/90"
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          haptic("light");
          void rejectHours(hourId);
        }}
      >
        Reject
      </Button>
    </div>
  );
}
