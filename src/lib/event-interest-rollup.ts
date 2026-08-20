import "server-only";
import { db } from "@/lib/db";
import {
  eventInterest,
  users,
  volunteerCampaignEvents,
  volunteerInterests,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * "Did anyone volunteer for Field Day?" — asked once, answered from both doors.
 *
 * A school captures the same intent through two systems that have nothing in
 * common structurally. `volunteer_interests` is campaign-scoped and keyed by
 * **email**, because the whole point of a QR flyer at Back to School Night is
 * that it works with no account. `event_interest` is keyed by **user**, because
 * Our Events is behind a sign-in. Both mean "I'd help with this event".
 *
 * So this is a **read-only union**, and deliberately so: merging the tables
 * would break the campaign page's no-account guarantee and its
 * `(campaignEventId, email)` unique. The join back to a recurring event runs
 * through `volunteer_campaign_events.event_catalog_id`, which is already stored
 * as provenance — editing campaign copy never mutates the catalog, and this
 * never writes anything either.
 *
 * De-duplicated on lowercased email where an account exists, so the parent who
 * scanned the QR code in September and then raised a hand on Our Events in
 * February is one person, not two.
 */

export type InterestSource = "our_events" | "campaign";

export interface RolledUpInterest {
  name: string;
  email: string;
  phone: string | null;
  /** `lead` / `help` / `observe` from Our Events; the campaign's own level otherwise. */
  level: string;
  notes: string | null;
  /** Null for a campaign row from someone who has never signed in. */
  userId: string | null;
  /** Which doors this person came through — both, for the September-and-February case. */
  sources: InterestSource[];
}

export async function getRolledUpEventInterest(params: {
  schoolId: string;
  schoolYear: string;
  /** One recurring event, or several — the board's rollup asks for several. */
  eventCatalogIds: string[];
}): Promise<Map<string, RolledUpInterest[]>> {
  const { schoolId, schoolYear, eventCatalogIds } = params;
  if (eventCatalogIds.length === 0) return new Map();

  const [inApp, viaCampaign] = await Promise.all([
    db
      .select({
        eventCatalogId: eventInterest.eventCatalogId,
        userId: eventInterest.userId,
        level: eventInterest.interestLevel,
        notes: eventInterest.notes,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(eventInterest)
      .innerJoin(users, eq(eventInterest.userId, users.id))
      .where(
        and(
          eq(eventInterest.schoolId, schoolId),
          eq(eventInterest.schoolYear, schoolYear),
          inArray(eventInterest.eventCatalogId, eventCatalogIds)
        )
      ),
    db
      .select({
        eventCatalogId: volunteerCampaignEvents.eventCatalogId,
        userId: volunteerInterests.userId,
        level: volunteerInterests.interestLevel,
        notes: volunteerInterests.notes,
        name: volunteerInterests.name,
        email: volunteerInterests.email,
        phone: volunteerInterests.phone,
      })
      .from(volunteerInterests)
      .innerJoin(
        volunteerCampaignEvents,
        eq(volunteerInterests.campaignEventId, volunteerCampaignEvents.id)
      )
      .where(
        and(
          eq(volunteerInterests.schoolId, schoolId),
          eq(volunteerInterests.schoolYear, schoolYear),
          eq(volunteerInterests.status, "active"),
          // A campaign event that was never filed under a recurring event has
          // nothing to roll up *to*; it isn't lost, it just isn't this list.
          inArray(volunteerCampaignEvents.eventCatalogId, eventCatalogIds),
          isNull(volunteerInterests.removedAt)
        )
      ),
  ]);

  const byCatalog = new Map<string, Map<string, RolledUpInterest>>();

  const add = (
    eventCatalogId: string | null,
    source: InterestSource,
    row: {
      userId: string | null;
      level: string;
      notes: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
    }
  ) => {
    if (!eventCatalogId || !row.email) return;
    const key = row.email.trim().toLowerCase();
    const people = byCatalog.get(eventCatalogId) ?? new Map();
    const existing = people.get(key);

    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      // The account is the better identity, and the in-app row's level is the
      // more recent statement — but never blank out a phone the campaign has
      // and the account doesn't.
      existing.userId ??= row.userId;
      existing.phone ??= row.phone;
      existing.notes ??= row.notes;
    } else {
      people.set(key, {
        name: row.name ?? row.email,
        email: row.email,
        phone: row.phone,
        level: row.level,
        notes: row.notes,
        userId: row.userId,
        sources: [source],
      });
    }
    byCatalog.set(eventCatalogId, people);
  };

  // In-app first, so its level and name win the merge above.
  for (const row of inApp) add(row.eventCatalogId, "our_events", row);
  for (const row of viaCampaign) add(row.eventCatalogId, "campaign", row);

  return new Map(
    [...byCatalog.entries()].map(([catalogId, people]) => [
      catalogId,
      [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ])
  );
}
