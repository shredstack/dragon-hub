"use client";

import { approveHours, rejectHours } from "@/actions/volunteer-hours";
import { Button } from "@/components/ui/button";

export function ApprovalActions({ hourId }: { hourId: string }) {
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => approveHours(hourId)} className="bg-success text-success-foreground hover:bg-success/90">
        Approve
      </Button>
      <Button size="sm" variant="destructive" onClick={() => rejectHours(hourId)}>
        Reject
      </Button>
    </div>
  );
}
