"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listSharedDriveFolders } from "@/actions/integrations";

interface SharedFolder {
  id: string;
  name: string;
  owner: string | null;
  configured: boolean;
}

/**
 * The list of folders the service account has actually been given.
 *
 * Sharing attaches to a folder, not to a Google account, so a folder created
 * beside ten working ones — same Drive, same owner — is reachable by nobody
 * until someone shares it. That is invisible from inside Drive, where the new
 * folder looks exactly like its neighbours. This is the view from the other
 * side.
 */
export function SharedFoldersPanel({
  serviceAccountEmail,
}: {
  serviceAccountEmail: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    folders: SharedFolder[];
    sharedDrives: Array<{ id: string; name: string }>;
  } | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      setData(await listSharedDriveFolders());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach Drive");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">Folders shared with the service account</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything <span className="font-mono text-xs">{serviceAccountEmail}</span>{" "}
            can reach. A folder missing from this list hasn&apos;t been shared with
            it — being in the right Google account isn&apos;t enough, because Drive
            attaches sharing to each folder.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLoad}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? "Checking…" : data ? "Refresh" : "Show folders"}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {data && (
        <div className="mt-4 space-y-3">
          {data.folders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing is shared with this service account yet.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.folders.map((folder) => (
                <li
                  key={folder.id}
                  className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{folder.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {folder.id}
                      {folder.owner ? ` · ${folder.owner}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={folder.configured ? "default" : "outline"}
                    className="shrink-0"
                  >
                    {folder.configured ? "Configured" : "Not added yet"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {data.sharedDrives.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Also a member of{" "}
              {data.sharedDrives.map((d) => d.name).join(", ")}.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Subfolders of these are readable too, so they don&apos;t appear here.
            Only folders shared directly with the service account are listed.
          </p>
        </div>
      )}
    </div>
  );
}
