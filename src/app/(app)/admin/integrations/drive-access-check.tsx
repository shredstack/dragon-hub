"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { checkDriveFolderAccess } from "@/actions/integrations";

/**
 * Asks Drive whether this folder is actually readable, right now.
 *
 * Worth a button of its own because the failure it catches is invisible from
 * everywhere else: Drive answers a listing of a folder nobody shared with the
 * service account with an empty 200, so the folder sits in this table looking
 * connected while every sync quietly indexes nothing.
 */
export function DriveAccessCheck({ id }: { id: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    { ok: true; fileCount: number } | { ok: false; error: string } | null
  >(null);

  async function handleCheck() {
    setLoading(true);
    setResult(null);
    try {
      const res = await checkDriveFolderAccess(id);
      setResult(
        res.ok ? { ok: true, fileCount: res.fileCount } : { ok: false, error: res.error }
      );
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Check failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="ghost" size="sm" onClick={handleCheck} disabled={loading}>
        {loading ? "Checking…" : "Check access"}
      </Button>
      {result?.ok && (
        <p className="text-xs text-green-600 dark:text-green-500">
          {result.fileCount === 0
            ? "Readable, but empty — nothing to sync."
            : `Readable — ${result.fileCount} file${result.fileCount === 1 ? "" : "s"} visible.`}
        </p>
      )}
      {result && !result.ok && (
        <p className="max-w-xs text-xs text-destructive">{result.error}</p>
      )}
    </div>
  );
}
