import { cache } from "react";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * When the "Sync Minutes" / "Index Now" buttons last actually finished a run,
 * for the "Last synced: ..." line next to each button.
 *
 * Not derived from `pta_minutes.last_synced_at` / `drive_file_index.last_indexed_at`:
 * those only move for rows a run actually inserted or updated, so a run that
 * finds nothing new (every minutes doc already approved, no new Drive files)
 * would leave MAX() frozen at a stale timestamp even though the sync just ran
 * successfully. This column is stamped once, unconditionally, on every
 * completed run — see the end of syncSchoolMinutes / indexSchoolDriveFiles.
 *
 * Same missing-column/missing-key-means-never-run precedent as
 * `moduleVisibility`: a school that has never synced simply has no key, not a
 * backfilled null.
 */
export interface SyncStatus {
  minutesLastSyncedAt: string | null;
  driveLastIndexedAt: string | null;
}

export type StoredSyncStatus = Partial<
  Record<keyof SyncStatus, string | null | undefined>
>;

function resolveSyncStatus(stored: StoredSyncStatus | null | undefined): SyncStatus {
  return {
    minutesLastSyncedAt: stored?.minutesLastSyncedAt ?? null,
    driveLastIndexedAt: stored?.driveLastIndexedAt ?? null,
  };
}

/** Cached per request — the page and the button both ask. */
export const getSyncStatus = cache(async function getSyncStatus(
  schoolId: string | null | undefined
): Promise<SyncStatus> {
  if (!schoolId) return resolveSyncStatus(null);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { syncStatus: true },
  });

  return resolveSyncStatus(school?.syncStatus);
});

/**
 * Stamp one key with the current instant. Called at the end of a completed
 * sync/index run — never on an early return (no credentials, no folders
 * configured), which isn't a run that finished, just one that didn't start.
 */
export async function touchSyncStatus(
  schoolId: string,
  key: keyof SyncStatus,
  at: Date
): Promise<void> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { syncStatus: true },
  });

  await db
    .update(schools)
    .set({
      syncStatus: {
        ...(school?.syncStatus ?? {}),
        [key]: at.toISOString(),
      },
    })
    .where(eq(schools.id, schoolId));
}
