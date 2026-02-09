"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { triggerMinutesSync } from "@/actions/minutes";

export function SyncMinutesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    try {
      const result = await triggerMinutesSync();
      alert(`Synced ${result.synced} minutes files`);
      router.refresh();
    } catch (error) {
      console.error("Failed to sync minutes:", error);
      alert("Failed to sync minutes");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleSync} disabled={loading} variant="outline">
      {loading ? "Syncing..." : "Sync Minutes"}
    </Button>
  );
}
