"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { regenerateAnalysis } from "@/actions/minutes";
import { RefreshCw } from "lucide-react";

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
      await regenerateAnalysis(minutesId);
      router.refresh();
    } catch (error) {
      console.error("Failed to regenerate analysis:", error);
      alert("Failed to regenerate analysis. Please try again.");
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
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Analyzing..." : "Regenerate Analysis"}
    </Button>
  );
}
