"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { triggerMinutesSync } from "@/actions/minutes";

export function SyncMinutesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    if (message) {
      // Folder problems stay until the next sync — they name a fix someone has
      // to go and make in Drive, which takes longer than five seconds to read.
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    setProblems([]);
    try {
      const result = await triggerMinutesSync();
      const parts = [`Synced ${result.synced} files`];
      if (result.skipped > 0) {
        parts.push(`${result.skipped} approved skipped`);
      }
      setMessage({ type: "success", text: parts.join(", ") });
      setProblems(result.folderProblems);
      router.refresh();
    } catch (error) {
      console.error("Failed to sync minutes:", error);
      setMessage({ type: "error", text: "Failed to sync minutes" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button onClick={handleSync} disabled={loading} variant="outline">
          {loading ? "Syncing..." : "Sync Minutes"}
        </Button>
        {message && (
          <span
            className={`text-sm ${
              message.type === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {message.text}
          </span>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="max-w-md space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
