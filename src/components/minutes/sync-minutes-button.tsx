"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { triggerMinutesSync } from "@/actions/minutes";
import { formatDateTimeInTimeZone } from "@/lib/time-zone";

export function SyncMinutesButton({
  lastSyncedAt,
  timeZone,
}: {
  lastSyncedAt: string | null;
  timeZone: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  // Holds the previous run's timestamp across the request so "Last synced" has
  // something to show the instant loading flips back off, rather than a gap
  // until router.refresh() finishes re-rendering the server page.
  const [displaySyncedAt, setDisplaySyncedAt] = useState(lastSyncedAt);

  useEffect(() => {
    setDisplaySyncedAt(lastSyncedAt);
  }, [lastSyncedAt]);

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
      setDisplaySyncedAt(new Date().toISOString());
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
        {!loading && !message && displaySyncedAt && (
          <span className="text-xs text-muted-foreground">
            Last synced {formatDateTimeInTimeZone(displaySyncedAt, timeZone)}
          </span>
        )}
      </div>
      {loading && (
        <div className="max-w-xs space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full origin-left animate-pulse rounded-full bg-primary" />
          </div>
          <p className="text-xs text-muted-foreground">
            This can take a few minutes for large folders — it&apos;s safe to
            navigate away, the sync keeps running.
          </p>
        </div>
      )}
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
