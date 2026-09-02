import Link from "next/link";
import { auth } from "@/lib/auth";
import { assertPtaBoardMember, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventCatalog,
  eventContactLinks,
  eventPlans,
  tags,
} from "@/lib/db/schema";
import { eq, and, asc, desc, count, isNull, isNotNull } from "drizzle-orm";
import { EventCatalogAdmin } from "./event-catalog-admin";
import { getHuntsByCatalogEntry } from "@/actions/scavenger-hunts";
import { getPlannedCatalogIds } from "@/actions/year-planning";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  getBoardPositionsWithSeed,
  getBoardPositionLabels,
} from "@/lib/board-positions";

export default async function EventCatalogAdminPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  await assertPtaBoardMember(session.user.id, schoolId);

  const [
    entries,
    planCounts,
    availableTags,
    unlinkedPlans,
    huntsByCatalogId,
    currentSchoolYear,
    plannedByCatalogId,
    contactCounts,
  ] = await Promise.all([
    db.query.eventCatalog.findMany({
      where: eq(eventCatalog.schoolId, schoolId),
      orderBy: [asc(eventCatalog.title)],
    }),
    // How many school years each recurring event has been run — the signal
    // that tells a new board member "this one has history, go read it".
    db
      .select({
        catalogId: eventPlans.eventCatalogId,
        years: count(),
      })
      .from(eventPlans)
      .where(
        and(
          eq(eventPlans.schoolId, schoolId),
          isNotNull(eventPlans.eventCatalogId)
        )
      )
      .groupBy(eventPlans.eventCatalogId),
    db.query.tags.findMany({
      where: eq(tags.schoolId, schoolId),
      columns: { name: true, displayName: true },
      orderBy: [desc(tags.usageCount)],
    }),
    // Plans nobody has filed under a recurring event and that aren't marked
    // one-offs. These are the gaps in year-over-year history.
    db.query.eventPlans.findMany({
      where: and(
        eq(eventPlans.schoolId, schoolId),
        isNull(eventPlans.eventCatalogId),
        eq(eventPlans.isOneOff, false)
      ),
      columns: { id: true, title: true, schoolYear: true },
      orderBy: [desc(eventPlans.schoolYear)],
    }),
    // The scavenger hunts run at each of these events — the other half of
    // "what did we do at Back to School Night last year?".
    getHuntsByCatalogEntry(),
    getSchoolCurrentYear(schoolId),
    // Which entries already have this year's plan, so the list can answer
    // "what still needs planning?" without a trip to Plan the Year.
    getPlannedCatalogIds(),
    // One grouped count rather than a per-row fetch: the contacts panel loads
    // its own list when a row is expanded, and this is only the summary that
    // makes an unexpanded row worth expanding.
    db
      .select({
        catalogId: eventContactLinks.eventCatalogId,
        total: count(),
      })
      .from(eventContactLinks)
      .innerJoin(
        eventCatalog,
        eq(eventContactLinks.eventCatalogId, eventCatalog.id)
      )
      .where(eq(eventCatalog.schoolId, schoolId))
      .groupBy(eventContactLinks.eventCatalogId),
  ]);

  const yearsByCatalogId = Object.fromEntries(
    planCounts.map((p) => [p.catalogId!, Number(p.years)])
  );
  const contactCountByCatalogId = Object.fromEntries(
    contactCounts.map((c) => [c.catalogId!, Number(c.total)])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recurring Events</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One entry per event the PTA runs every year — Field Day,
          Valentine&rsquo;s Day Parties, the Fun Run. Each school year&rsquo;s
          event plan links back here, so contacts, tips, and budgets carry
          forward instead of being rediscovered every fall. Open{" "}
          {currentSchoolYear}&rsquo;s plan for any of them from its row; to open
          the whole year at once, use{" "}
          <Link
            href="/admin/board/event-plan-setup"
            className="underline hover:text-foreground"
          >
            Plan the Year
          </Link>
          .
        </p>
      </div>

      <EventCatalogAdmin
        entries={entries}
        positions={await getBoardPositionsWithSeed(schoolId)}
        positionLabels={await getBoardPositionLabels(schoolId)}
        yearsByCatalogId={yearsByCatalogId}
        availableTags={availableTags}
        unlinkedPlans={unlinkedPlans}
        huntsByCatalogId={huntsByCatalogId}
        currentSchoolYear={currentSchoolYear}
        plannedByCatalogId={plannedByCatalogId}
        contactCountByCatalogId={contactCountByCatalogId}
      />
    </div>
  );
}
