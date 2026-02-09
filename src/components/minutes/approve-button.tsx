"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveMinutes } from "@/actions/minutes";

interface ApproveButtonProps {
  minutesId: string;
}

export function ApproveButton({ minutesId }: ApproveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await approveMinutes(minutesId);
      router.refresh();
    } catch (error) {
      console.error("Failed to approve minutes:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleApprove} disabled={loading} size="sm">
      {loading ? "Approving..." : "Approve"}
    </Button>
  );
}
