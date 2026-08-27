"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { syncCalendars, syncBudget, indexDriveFiles } from "@/actions/integrations";
import { formatDateTimeInTimeZone } from "@/lib/time-zone";

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

export function IndexDriveButton({
  disabled = false,
  lastIndexedAt,
  timeZone,
}: {
  disabled?: boolean;
  lastIndexedAt: string | null;
  timeZone: string;
}) {
  const router = useRouter();
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState<{
    indexed?: number;
    errors?: number;
    deleted?: number;
    embedded?: number;
    error?: string;
  } | null>(null);
  // Carries the previous run's timestamp across the request so "Last indexed"
  // has something to show the instant indexing flips back off, rather than a
  // gap until router.refresh() finishes re-rendering the server page.
  const [displayIndexedAt, setDisplayIndexedAt] = useState(lastIndexedAt);

  useEffect(() => {
    setDisplayIndexedAt(lastIndexedAt);
  }, [lastIndexedAt]);

  async function handleIndex() {
    setIndexing(true);
    setResult(null);
    try {
      const res = await indexDriveFiles();
      setResult(res);
      setDisplayIndexedAt(new Date().toISOString());
      router.refresh();
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Indexing failed" });
    } finally {
      setIndexing(false);
    }
  }

  return (
    <div className="space-y-2">
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
              : `${result.indexed} files indexed${result.deleted ? `, ${result.deleted} removed` : ""}${
                  result.embedded
                    ? `, ${result.embedded} ready for Ask DragonHub`
                    : ""
                }`}
          </span>
        )}
        {!indexing && !result && displayIndexedAt && (
          <span className="text-xs text-muted-foreground">
            Last indexed {formatDateTimeInTimeZone(displayIndexedAt, timeZone)}
          </span>
        )}
      </div>
      {indexing && (
        <div className="max-w-xs space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full origin-left animate-pulse rounded-full bg-primary" />
          </div>
          <p className="text-xs text-muted-foreground">
            This can take a few minutes for large folders — it&apos;s safe to
            navigate away, indexing keeps running.
          </p>
        </div>
      )}
    </div>
  );
}
