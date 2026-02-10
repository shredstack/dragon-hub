"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { backfillMinutesAnalysis } from "@/actions/minutes";
import { RefreshCw } from "lucide-react";

interface BackfillButtonProps {
  count: number;
}

export function BackfillButton({ count }: BackfillButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const handleBackfill = async () => {
    if (
      !confirm(
        `This will analyze ${count} minutes documents using AI. This may take a few minutes. Continue?`
      )
    )
      return;

    setLoading(true);
    setProgress("Starting analysis...");

    try {
      const result = await backfillMinutesAnalysis();
      setProgress(
        `Completed: ${result.processed} processed, ${result.errors} errors`
      );
      router.refresh();
    } catch (error) {
      console.error("Backfill failed:", error);
      setProgress("Failed to complete analysis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={handleBackfill}
        disabled={loading}
        variant="outline"
        className="border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Analyzing..." : `Analyze ${count} Minutes`}
      </Button>
      {progress && (
        <p className="text-sm text-muted-foreground">{progress}</p>
      )}
    </div>
  );
}
