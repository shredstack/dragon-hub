"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { triggerMinutesSync } from "@/actions/minutes";

export function SyncMinutesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const result = await triggerMinutesSync();
      setMessage({ type: "success", text: `Synced ${result.synced} files` });
      router.refresh();
    } catch (error) {
      console.error("Failed to sync minutes:", error);
      setMessage({ type: "error", text: "Failed to sync minutes" });
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}
