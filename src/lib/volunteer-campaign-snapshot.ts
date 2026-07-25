import { db } from "@/lib/db";
import { volunteerCampaignEvents } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { monthLabel } from "@/lib/constants";

/**
 * The subset of an `event_catalog` row a campaign card is seeded from. Kept as
 * its own type so the copy rule below has exactly one definition — the whole
 * class of "catalog edits didn't reach the campaign" bugs comes from this
 * mapping living in more than one place.
 */
export interface CatalogSnapshotSource {
  title: string;
  description: string | null;
  volunteerResponsibilities: string | null;
  keyTasks: string | null;
  timeCommitment: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  typicalMonth: number | null;
  timingNote: string | null;
  typicalTiming: string | null;
}

/** The `volunteer_campaign_events` columns derived from a catalog entry. */
export interface CatalogSnapshot {
  title: string;
  description: string | null;
  volunteerResponsibilities: string | null;
  typicalTiming: string | null;
  timeCommitment: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
}

const SNAPSHOT_FIELDS = [
  "title",
  "description",
  "volunteerResponsibilities",
  "typicalTiming",
  "timeCommitment",
  "iconEmoji",
  "imageUrl",
] as const;

type SnapshotField = (typeof SNAPSHOT_FIELDS)[number];

export function formatKeyTasks(keyTasks: string | null): string | null {
  if (!keyTasks) return null;
  try {
    const parsed = JSON.parse(keyTasks);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((task) => `• ${String(task)}`).join("\n");
  } catch {
    // Not valid JSON — surface it as-is rather than dropping the content.
    return keyTasks;
  }
}

/**
 * Render a catalog entry's timing the way a parent reads it: "Late October",
 * "October", or whatever nuance note the board wrote.
 */
export function catalogTiming(entry: {
  typicalMonth: number | null;
  timingNote: string | null;
  typicalTiming: string | null;
}): string | null {
  const month = monthLabel(entry.typicalMonth);
  if (entry.timingNote && month) return `${entry.timingNote} (${month})`;
  return entry.timingNote ?? month ?? entry.typicalTiming;
}

/**
 * The single definition of what a campaign card looks like when freshly copied
 * from a recurring event. Used both when an event is first imported onto a
 * campaign and when deciding whether an existing card still holds the untouched
 * snapshot (see `propagateCatalogSnapshot`).
 */
export function catalogSnapshot(entry: CatalogSnapshotSource): CatalogSnapshot {
  return {
    title: entry.title,
    description: entry.description,
    // Prefer the catalog's own volunteer copy. Key tasks are the fallback:
    // they're board-facing planning steps, but a rough "here's what happens"
    // beats an empty card while boards fill the real field in.
    volunteerResponsibilities:
      entry.volunteerResponsibilities ?? formatKeyTasks(entry.keyTasks),
    typicalTiming: catalogTiming(entry),
    timeCommitment: entry.timeCommitment,
    iconEmoji: entry.iconEmoji,
    imageUrl: entry.imageUrl,
  };
}

/**
 * Push an edited recurring event out to the campaign cards copied from it —
 * but only cards that still hold the untouched snapshot.
 *
 * The catalog→campaign copy is deliberately a snapshot, not a live reference:
 * a board can tune a card's wording for one flyer and that tuning must survive
 * later catalog edits. So a field is overwritten only when the card still holds
 * exactly what it was seeded with (it equals the *old* snapshot value); a field
 * the board has changed no longer matches and is left alone. Archived cards are
 * skipped entirely — they're history behind volunteer signups.
 *
 * Returns the number of cards updated. Revalidates every campaign it touched.
 */
export async function propagateCatalogSnapshot(
  catalogId: string,
  before: CatalogSnapshotSource,
  after: CatalogSnapshotSource
): Promise<number> {
  const oldSnap = catalogSnapshot(before);
  const newSnap = catalogSnapshot(after);

  const changed = SNAPSHOT_FIELDS.filter((f) => oldSnap[f] !== newSnap[f]);
  if (changed.length === 0) return 0;

  const cards = await db.query.volunteerCampaignEvents.findMany({
    where: and(
      eq(volunteerCampaignEvents.eventCatalogId, catalogId),
      isNull(volunteerCampaignEvents.archivedAt)
    ),
    columns: {
      id: true,
      campaignId: true,
      title: true,
      description: true,
      volunteerResponsibilities: true,
      typicalTiming: true,
      timeCommitment: true,
      iconEmoji: true,
      imageUrl: true,
    },
  });
  if (cards.length === 0) return 0;

  const touchedCampaigns = new Set<string>();
  let updatedCount = 0;

  for (const card of cards) {
    const updates: Partial<Record<SnapshotField, string | null>> = {};
    for (const field of changed) {
      // Overwrite only a field the board never tuned: it still equals the value
      // this card was seeded with. `title` is NOT NULL on both sides, so every
      // comparison is well-defined.
      if (card[field] === oldSnap[field]) {
        updates[field] = newSnap[field];
      }
    }
    if (Object.keys(updates).length === 0) continue;

    await db
      .update(volunteerCampaignEvents)
      // `title` is NOT NULL on the row; the snapshot only ever assigns it a
      // real string (`entry.title`), so the `string | null` value type is safe.
      .set({ ...updates, updatedAt: new Date() } as Partial<
        typeof volunteerCampaignEvents.$inferInsert
      >)
      .where(eq(volunteerCampaignEvents.id, card.id));
    touchedCampaigns.add(card.campaignId);
    updatedCount += 1;
  }

  if (touchedCampaigns.size > 0) {
    revalidatePath("/admin/volunteer-campaigns");
    for (const campaignId of touchedCampaigns) {
      revalidatePath(`/admin/volunteer-campaigns/${campaignId}`);
    }
  }

  return updatedCount;
}
