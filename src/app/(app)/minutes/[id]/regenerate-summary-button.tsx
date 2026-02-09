"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { regenerateSummary } from "@/actions/minutes";

interface RegenerateSummaryButtonProps {
  minutesId: string;
}

export function RegenerateSummaryButton({
  minutesId,
}: RegenerateSummaryButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRegenerate() {
    setLoading(true);
    try {
      await regenerateSummary(minutesId);
      router.refresh();
    } catch (error) {
      console.error("Failed to regenerate summary:", error);
      alert("Failed to regenerate summary");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleRegenerate}
      disabled={loading}
      variant="outline"
      size="sm"
    >
      {loading ? "Generating..." : "Regenerate"}
    </Button>
  );
}
