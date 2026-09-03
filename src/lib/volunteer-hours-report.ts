import "server-only";
import { db } from "@/lib/db";
import { users, volunteerHours } from "@/lib/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  volunteerDisplayEmail,
  volunteerDisplayName,
  volunteerIdentityKey,
} from "@/lib/volunteer-hours-queue";
import {
  getPreviousSchoolYear,
  getSchoolYearForMonth,
  parseSchoolYear,
  schoolYearDateRange,
  sortSchoolYearsDesc,
} from "@/lib/school-year";

/**
 * The secretary's view of what the school gave.
 *
 * A PTA reports volunteer hours three ways and asks the same question of all
 * three: line by line (the substantiation), by month (the rhythm — is anybody
 * showing up in February?), and by school year (the headline the board takes to
 * the district and the state PTA). Comparing this year to last is the whole
 * point of the third, so a year total that can't be set beside its predecessor
 * isn't a report, it's a number.
 *
 * `volunteer_hours` is stamped with a real calendar `date` and no school year,
 * so every grouping here runs through `schoolYearDateRange` /
 * `getSchoolYearForMonth` — the same August 1 boundary the member page and the
 * dashboard already use. Two different definitions of "this year" on two pages
 * showing the same hours is how a board loses trust in both.
 *
 * A volunteer here is not necessarily an account. The board transcribes the
 * paper sheet from the monthly meeting, so plenty of rows name somebody who has
 * never signed in — hence the LEFT JOIN and `volunteerIdentityKey`, which is
 * what "one volunteer" means on every count on this page. An inner join drops
 * exactly the people a PTA most wants credit for.
 *
 * The heavy lifting is one aggregate query grouped by `(month, volunteer)`,
 * which is the coarsest grouping every summary on the page can still be derived
 * from: months roll up into years, and volunteers-per-month dedupe into
 * volunteers-per-year. A second query fetches line items for the selected year
 * only, because that's the one list a person reads rather than skims.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** One line of the detail list. */
export interface HourEntry {
  id: string;
  date: string;
  volunteerName: string;
  /** Null for a volunteer the board recorded by name alone. */
  volunteerEmail: string | null;
  /** False when nobody has claimed these hours — see `volunteer-hours-queue`. */
  hasAccount: boolean;
  eventName: string;
  category: string | null;
  hours: number;
  approved: boolean;
  notes: string | null;
}

/** One slot in the selected year, Aug through Jul, beside the year before it. */
export interface MonthRow {
  /** 1-12. */
  monthNumber: number;
  /** Calendar year the month falls in — August 2025 for the 2025-2026 year. */
  calendarYear: number;
  label: string;
  shortLabel: string;
  approvedHours: number;
  pendingHours: number;
  entryCount: number;
  volunteerCount: number;
  /** Same month of the previous school year, for the comparison column. */
  previousApprovedHours: number;
}

export interface YearRow {
  schoolYear: string;
  approvedHours: number;
  pendingHours: number;
  entryCount: number;
  volunteerCount: number;
  /** Approved hours the year before, or null when there's nothing to compare. */
  previousApprovedHours: number | null;
}

export interface VolunteerRow {
  /** Stable per person, account or not. Never a database id — see below. */
  key: string;
  userId: string | null;
  name: string;
  email: string | null;
  /** False for someone the board has only ever recorded off the paper sheet. */
  hasAccount: boolean;
  approvedHours: number;
  pendingHours: number;
  entryCount: number;
}

export interface CategoryRow {
  category: string | null;
  approvedHours: number;
  pendingHours: number;
  entryCount: number;
}

export interface YearTotals {
  approvedHours: number;
  pendingHours: number;
  entryCount: number;
  volunteerCount: number;
}

export interface VolunteerHoursReport {
  schoolYear: string;
  previousSchoolYear: string;
  /** Every school year the school has hours in, newest first. */
  years: YearRow[];
  months: MonthRow[];
  volunteers: VolunteerRow[];
  categories: CategoryRow[];
  entries: HourEntry[];
  totals: YearTotals;
  previousTotals: YearTotals;
}

/** Hours are a decimal(5,2); keep the sums off the float cliff edge. */
function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyTotals(): YearTotals {
  return { approvedHours: 0, pendingHours: 0, entryCount: 0, volunteerCount: 0 };
}

/**
 * The twelve month slots a school year occupies, in school-year order.
 *
 * August first, because a report that opens in January reads as a calendar and
 * a PTA year doesn't work that way.
 */
export function schoolYearMonths(
  schoolYear: string
): { monthNumber: number; calendarYear: number; key: string }[] {
  const startYear = parseSchoolYear(schoolYear);
  if (Number.isNaN(startYear)) return [];

  const slots: { monthNumber: number; calendarYear: number; key: string }[] = [];
  for (let offset = 0; offset < 12; offset += 1) {
    const monthIndex = (7 + offset) % 12; // 7 === August, zero-based
    const monthNumber = monthIndex + 1;
    const calendarYear = monthNumber >= 8 ? startYear : startYear + 1;
    slots.push({
      monthNumber,
      calendarYear,
      key: `${calendarYear}-${String(monthNumber).padStart(2, "0")}`,
    });
  }
  return slots;
}

export function monthLabel(monthNumber: number, calendarYear: number): string {
  return `${MONTH_NAMES[monthNumber - 1]} ${calendarYear}`;
}

export function shortMonthLabel(monthNumber: number): string {
  return MONTH_SHORT[monthNumber - 1];
}

/**
 * Build the whole report for one school year.
 *
 * Callers are already board-gated; this function does no authorization of its
 * own and must not be reached from a member surface — it names every volunteer
 * at the school and what they logged.
 */
export async function getVolunteerHoursReport(
  schoolId: string,
  schoolYear: string
): Promise<VolunteerHoursReport> {
  const previousSchoolYear = getPreviousSchoolYear(schoolYear);
  const { start, end } = schoolYearDateRange(schoolYear);

  const [monthly, entryRows] = await Promise.all([
    // One row per (month, volunteer), across every year the school has. Small
    // enough to group in JS — a school with 300 volunteers across five years
    // tops out in the low thousands — and it is the only grouping from which
    // months, years, volunteers and distinct-volunteer counts all follow
    // without asking the database four times.
    //
    // `filter (where approved)` and `is not true` split every row into exactly
    // one bucket: `approved` is nullable, and a report that silently drops a
    // null row is worse than one that calls it pending.
    db
      .select({
        month: sql<string>`to_char(${volunteerHours.date}, 'YYYY-MM')`,
        identity: volunteerIdentityKey,
        userId: volunteerHours.userId,
        userName: volunteerDisplayName,
        userEmail: volunteerDisplayEmail,
        approvedHours: sql<string>`coalesce(sum(${volunteerHours.hours}) filter (where ${volunteerHours.approved}), 0)`,
        pendingHours: sql<string>`coalesce(sum(${volunteerHours.hours}) filter (where ${volunteerHours.approved} is not true), 0)`,
        entryCount: sql<number>`count(*)::int`,
      })
      .from(volunteerHours)
      .leftJoin(users, eq(volunteerHours.userId, users.id))
      .where(eq(volunteerHours.schoolId, schoolId))
      .groupBy(
        sql`to_char(${volunteerHours.date}, 'YYYY-MM')`,
        volunteerIdentityKey,
        volunteerHours.userId,
        volunteerDisplayName,
        volunteerDisplayEmail
      ),
    db
      .select({
        id: volunteerHours.id,
        date: volunteerHours.date,
        eventName: volunteerHours.eventName,
        category: volunteerHours.category,
        hours: volunteerHours.hours,
        approved: volunteerHours.approved,
        notes: volunteerHours.notes,
        userId: volunteerHours.userId,
        userName: volunteerDisplayName,
        userEmail: volunteerDisplayEmail,
      })
      .from(volunteerHours)
      .leftJoin(users, eq(volunteerHours.userId, users.id))
      .where(
        and(
          eq(volunteerHours.schoolId, schoolId),
          gte(volunteerHours.date, start),
          lte(volunteerHours.date, end)
        )
      )
      .orderBy(desc(volunteerHours.date)),
  ]);

  // ── Roll the aggregate up two ways ────────────────────────────────────────

  interface Bucket {
    approvedHours: number;
    pendingHours: number;
    entryCount: number;
    volunteers: Set<string>;
  }
  const newBucket = (): Bucket => ({
    approvedHours: 0,
    pendingHours: 0,
    entryCount: 0,
    volunteers: new Set<string>(),
  });

  const byYear = new Map<string, Bucket>();
  const byMonth = new Map<string, Bucket>();
  const volunteersByYear = new Map<string, Map<string, VolunteerRow>>();

  for (const row of monthly) {
    const [yearText, monthText] = row.month.split("-");
    const calendarYear = Number(yearText);
    const monthNumber = Number(monthText);
    if (Number.isNaN(calendarYear) || Number.isNaN(monthNumber)) continue;

    const rowYear = getSchoolYearForMonth(monthNumber, calendarYear);
    const approvedHours = Number(row.approvedHours) || 0;
    const pendingHours = Number(row.pendingHours) || 0;

    for (const [map, key] of [
      [byYear, rowYear],
      [byMonth, row.month],
    ] as const) {
      const bucket = map.get(key) ?? newBucket();
      bucket.approvedHours += approvedHours;
      bucket.pendingHours += pendingHours;
      bucket.entryCount += row.entryCount;
      bucket.volunteers.add(row.identity);
      map.set(key, bucket);
    }

    const people = volunteersByYear.get(rowYear) ?? new Map<string, VolunteerRow>();
    const person = people.get(row.identity) ?? {
      key: row.identity,
      userId: row.userId,
      name: row.userName ?? row.userEmail ?? "Unknown",
      email: row.userEmail,
      hasAccount: !!row.userId,
      approvedHours: 0,
      pendingHours: 0,
      entryCount: 0,
    };
    person.approvedHours += approvedHours;
    person.pendingHours += pendingHours;
    person.entryCount += row.entryCount;
    people.set(row.identity, person);
    volunteersByYear.set(rowYear, people);
  }

  const totalsFor = (year: string): YearTotals => {
    const bucket = byYear.get(year);
    if (!bucket) return emptyTotals();
    return {
      approvedHours: roundHours(bucket.approvedHours),
      pendingHours: roundHours(bucket.pendingHours),
      entryCount: bucket.entryCount,
      volunteerCount: bucket.volunteers.size,
    };
  };

  // The selected year is always listed, even with nothing in it — "no hours
  // logged this year yet" is an answer, and an empty table is how you give it.
  const yearNames = sortSchoolYearsDesc([
    ...new Set([...byYear.keys(), schoolYear]),
  ]);

  const years: YearRow[] = yearNames.map((year) => {
    const totals = totalsFor(year);
    const previous = getPreviousSchoolYear(year);
    return {
      schoolYear: year,
      approvedHours: totals.approvedHours,
      pendingHours: totals.pendingHours,
      entryCount: totals.entryCount,
      volunteerCount: totals.volunteerCount,
      previousApprovedHours: byYear.has(previous)
        ? roundHours(byYear.get(previous)!.approvedHours)
        : null,
    };
  });

  const months: MonthRow[] = schoolYearMonths(schoolYear).map((slot) => {
    const bucket = byMonth.get(slot.key);
    // The same month a year earlier is the same slot shifted back twelve
    // months, which for Aug-Jul is simply the previous calendar year.
    const previousKey = `${slot.calendarYear - 1}-${String(slot.monthNumber).padStart(2, "0")}`;
    const previous = byMonth.get(previousKey);
    return {
      monthNumber: slot.monthNumber,
      calendarYear: slot.calendarYear,
      label: monthLabel(slot.monthNumber, slot.calendarYear),
      shortLabel: shortMonthLabel(slot.monthNumber),
      approvedHours: roundHours(bucket?.approvedHours ?? 0),
      pendingHours: roundHours(bucket?.pendingHours ?? 0),
      entryCount: bucket?.entryCount ?? 0,
      volunteerCount: bucket?.volunteers.size ?? 0,
      previousApprovedHours: roundHours(previous?.approvedHours ?? 0),
    };
  });

  const volunteers: VolunteerRow[] = [
    ...(volunteersByYear.get(schoolYear)?.values() ?? []),
  ]
    .map((person) => ({
      ...person,
      approvedHours: roundHours(person.approvedHours),
      pendingHours: roundHours(person.pendingHours),
    }))
    .sort(
      (a, b) =>
        b.approvedHours - a.approvedHours || a.name.localeCompare(b.name)
    );

  const entries: HourEntry[] = entryRows.map((row) => ({
    id: row.id,
    date: row.date,
    volunteerName: row.userName ?? row.userEmail ?? "Unknown",
    volunteerEmail: row.userEmail,
    hasAccount: !!row.userId,
    eventName: row.eventName,
    category: row.category,
    hours: Number(row.hours) || 0,
    approved: row.approved === true,
    notes: row.notes,
  }));

  // Categories come off the line items rather than the aggregate — they are
  // only ever shown for the selected year, and the aggregate deliberately
  // doesn't group by one more column for a summary that spans one year.
  const categoryBuckets = new Map<string, CategoryRow>();
  for (const entry of entries) {
    const key = entry.category ?? "";
    const bucket = categoryBuckets.get(key) ?? {
      category: entry.category,
      approvedHours: 0,
      pendingHours: 0,
      entryCount: 0,
    };
    if (entry.approved) bucket.approvedHours += entry.hours;
    else bucket.pendingHours += entry.hours;
    bucket.entryCount += 1;
    categoryBuckets.set(key, bucket);
  }
  const categories = [...categoryBuckets.values()]
    .map((bucket) => ({
      ...bucket,
      approvedHours: roundHours(bucket.approvedHours),
      pendingHours: roundHours(bucket.pendingHours),
    }))
    .sort((a, b) => b.approvedHours - a.approvedHours);

  return {
    schoolYear,
    previousSchoolYear,
    years,
    months,
    volunteers,
    categories,
    entries,
    totals: totalsFor(schoolYear),
    previousTotals: totalsFor(previousSchoolYear),
  };
}
