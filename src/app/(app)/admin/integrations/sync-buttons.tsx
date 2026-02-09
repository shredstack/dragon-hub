"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { syncCalendars, syncBudget, indexDriveFiles } from "@/actions/integrations";

export function SyncCalendarsButton({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    synced?: number;
    error?: string;
    errors?: string[];
  } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await syncCalendars();
      setResult(res);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={disabled || syncing}
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </Button>
      {result && (
        <span
          className={`text-xs ${result.error ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
        >
          {result.error
            ? result.error
            : result.errors
              ? `${result.synced} synced (${result.errors.length} failed)`
              : `${result.synced} events synced`}
        </span>
      )}
    </div>
  );
}

export function SyncBudgetButton({ disabled = false }: { disabled?: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    categories?: number;
    transactions?: number;
    error?: string;
  } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await syncBudget();
      setResult(res);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Sync failed" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={disabled || syncing}
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </Button>
      {result && (
        <span className="text-xs text-muted-foreground">
          {result.error
            ? result.error
            : `${result.categories} categories, ${result.transactions} transactions synced`}
        </span>
      )}
    </div>
  );
}

export function IndexDriveButton({ disabled = false }: { disabled?: boolean }) {
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState<{
    indexed?: number;
    errors?: number;
    deleted?: number;
    error?: string;
  } | null>(null);

  async function handleIndex() {
    setIndexing(true);
    setResult(null);
    try {
      const res = await indexDriveFiles();
      setResult(res);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Indexing failed" });
    } finally {
      setIndexing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleIndex}
        disabled={disabled || indexing}
      >
        {indexing ? "Indexing..." : "Index Now"}
      </Button>
      {result && (
        <span
          className={`text-xs ${result.error ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
        >
          {result.error
            ? result.error
            : `${result.indexed} files indexed${result.deleted ? `, ${result.deleted} removed` : ""}`}
        </span>
      )}
    </div>
  );
}
