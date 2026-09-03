import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { categoryLabel } from "@/lib/categories";
import { VOLUNTEER_CATEGORIES } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { VolunteerHoursReport } from "@/lib/volunteer-hours-report";
import { ReportDownloads, type ReportFile } from "./report-downloads";

/**
 * The report half of Manage Volunteer Hours.
 *
 * Everything here is server-rendered off one `VolunteerHoursReport`, and the
 * selected year lives in the URL — so a secretary can send the board a link to
 * *last* year's numbers, and nothing on the page is a client-side fetch waiting
 * to disagree with what the CSV says.
 *
 * The order is the order the questions get asked: how did this year go, how
 * does it compare, when did people actually show up, who and what for, and
 * finally the line items that substantiate all of it.
 */

interface Props {
  report: VolunteerHoursReport;
  /** Years offered in the picker — the school's configured slate plus any year with data. */
  availableYears: string[];
  /** The school's active year, badged in the picker so "current" is unambiguous. */
  currentYear: string;
}

function hrs(value: number): string {
  return value.toFixed(1);
}

export function VolunteerHoursReportView({
  report,
  availableYears,
  currentYear,
}: Props) {
  const files = buildReportFiles(report);
  const hasAnything = report.years.some((year) => year.entryCount > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">School year:</span>
          {availableYears.map((year) => (
            <Link
              key={year}
              href={`/admin/volunteer-hours?tab=reports&year=${year}`}
              scroll={false}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                year === report.schoolYear
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {year}
              {year === currentYear && year !== report.schoolYear && (
                <span className="ml-1 text-xs">· current</span>
              )}
            </Link>
          ))}
        </div>
        <ReportDownloads files={files} />
      </div>

      {!hasAnything ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">
            No volunteer hours have been logged at this school yet.
          </p>
        </div>
      ) : (
        <>
          <StatTiles report={report} />
          <YearComparison report={report} />
          <MonthBreakdown report={report} />
          <CategoryBreakdown report={report} />
          <VolunteerBreakdown report={report} />
          <EntryList report={report} />
        </>
      )}
    </div>
  );
}

// ─── Headline ───────────────────────────────────────────────────────────────

function StatTiles({ report }: { report: VolunteerHoursReport }) {
  const { totals, previousTotals } = report;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Approved hours</p>
        <p className="text-2xl font-bold">{hrs(totals.approvedHours)}</p>
        <Delta
          current={totals.approvedHours}
          previous={previousTotals.approvedHours}
          suffix={`vs ${report.previousSchoolYear}`}
        />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Volunteers</p>
        <p className="text-2xl font-bold">{totals.volunteerCount}</p>
        <Delta
          current={totals.volunteerCount}
          previous={previousTotals.volunteerCount}
          suffix={`vs ${report.previousSchoolYear}`}
          decimals={0}
        />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Entries logged</p>
        <p className="text-2xl font-bold">{totals.entryCount}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {totals.volunteerCount > 0
            ? `${hrs(totals.approvedHours / totals.volunteerCount)} hrs per volunteer`
            : "—"}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Awaiting approval</p>
        <p className="text-2xl font-bold">{hrs(totals.pendingHours)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Not counted in the totals above
        </p>
      </div>
    </div>
  );
}

/**
 * Change against the same measure a year earlier.
 *
 * A percentage off a zero base is not a number, so a year with no predecessor
 * says "no prior year" rather than "+∞%" — the first year a school uses
 * DragonHub is every school's first year.
 */
function Delta({
  current,
  previous,
  suffix,
  decimals = 1,
}: {
  current: number;
  previous: number;
  suffix: string;
  decimals?: number;
}) {
  if (previous === 0) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {current === 0 ? "—" : `No ${suffix.replace("vs ", "")} figure`}
      </p>
    );
  }

  const change = current - previous;
  const percent = Math.round((change / previous) * 100);
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;

  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-xs",
        change > 0
          ? "text-success"
          : change < 0
            ? "text-destructive"
            : "text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {change > 0 ? "+" : ""}
      {change.toFixed(decimals)} ({percent > 0 ? "+" : ""}
      {percent}%) {suffix}
    </p>
  );
}

// ─── Year over year ─────────────────────────────────────────────────────────

function YearComparison({ report }: { report: VolunteerHoursReport }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">By school year</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Approved hours only. A year runs August 1 through July 31, so hours
        logged over the summer land in the year that is starting.
      </p>

      {/* Mobile card view */}
      <div className="space-y-3 md:hidden">
        {report.years.map((year) => (
          <div
            key={year.schoolYear}
            className={cn(
              "rounded-lg border bg-card p-4",
              year.schoolYear === report.schoolYear
                ? "border-primary"
                : "border-border"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{year.schoolYear}</p>
                <p className="text-sm text-muted-foreground">
                  {year.volunteerCount} volunteers · {year.entryCount} entries
                </p>
              </div>
              <p className="text-lg font-semibold">{hrs(year.approvedHours)}</p>
            </div>
            {year.previousApprovedHours !== null && (
              <p className="mt-2 text-xs text-muted-foreground">
                {changeText(year.approvedHours, year.previousApprovedHours)} vs
                the year before
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3">School year</th>
                <th className="p-3 text-right">Approved hours</th>
                <th className="p-3 text-right">Change</th>
                <th className="p-3 text-right">Volunteers</th>
                <th className="p-3 text-right">Entries</th>
                <th className="p-3 text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {report.years.map((year) => (
                <tr
                  key={year.schoolYear}
                  className={cn(
                    "border-b border-border",
                    year.schoolYear === report.schoolYear && "bg-muted/40"
                  )}
                >
                  <td className="p-3 font-medium">
                    <Link
                      href={`/admin/volunteer-hours?tab=reports&year=${year.schoolYear}`}
                      className="hover:underline"
                    >
                      {year.schoolYear}
                    </Link>
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {hrs(year.approvedHours)}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">
                    {year.previousApprovedHours === null
                      ? "—"
                      : changeText(
                          year.approvedHours,
                          year.previousApprovedHours
                        )}
                  </td>
                  <td className="p-3 text-right">{year.volunteerCount}</td>
                  <td className="p-3 text-right">{year.entryCount}</td>
                  <td className="p-3 text-right text-muted-foreground">
                    {year.pendingHours > 0 ? hrs(year.pendingHours) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function changeText(current: number, previous: number): string {
  const change = current - previous;
  if (previous === 0) return change === 0 ? "—" : `+${change.toFixed(1)}`;
  const percent = Math.round((change / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)} (${percent >= 0 ? "+" : ""}${percent}%)`;
}

// ─── Month by month ─────────────────────────────────────────────────────────

function MonthBreakdown({ report }: { report: VolunteerHoursReport }) {
  // The bars are relative to the busiest month across *both* years, so the two
  // columns are actually comparable — scaling each to its own maximum would
  // draw a quiet year and a busy one identically.
  const peak = Math.max(
    1,
    ...report.months.map((m) =>
      Math.max(m.approvedHours, m.previousApprovedHours)
    )
  );

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">By month</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {report.schoolYear} beside {report.previousSchoolYear}, approved hours.
      </p>

      <div className="rounded-lg border border-border bg-card">
        <div className="divide-y divide-border">
          {report.months.map((month) => (
            <div
              key={`${month.calendarYear}-${month.monthNumber}`}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="w-32 shrink-0">
                <p className="text-sm font-medium">{month.label}</p>
                <p className="text-xs text-muted-foreground">
                  {month.entryCount > 0
                    ? `${month.entryCount} entries · ${month.volunteerCount} people`
                    : "No hours logged"}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Bar
                  value={month.approvedHours}
                  peak={peak}
                  className="bg-primary"
                />
                <Bar
                  value={month.previousApprovedHours}
                  peak={peak}
                  className="bg-muted-foreground/40"
                />
              </div>
              <div className="flex shrink-0 gap-4 text-right text-sm sm:w-40 sm:justify-end">
                <span className="font-semibold">
                  {hrs(month.approvedHours)}
                </span>
                <span className="text-muted-foreground">
                  {hrs(month.previousApprovedHours)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-4 border-t border-border p-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-primary" aria-hidden />
            {report.schoolYear}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-3 rounded-sm bg-muted-foreground/40"
              aria-hidden
            />
            {report.previousSchoolYear}
          </span>
        </div>
      </div>
    </section>
  );
}

function Bar({
  value,
  peak,
  className,
}: {
  value: number;
  peak: number;
  className: string;
}) {
  // A month with hours always draws something — a hairline is "a little", an
  // empty track is "none", and those must not look the same.
  const width = value > 0 ? Math.max(2, (value / peak) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-sm bg-muted">
      <div
        className={cn("h-2 rounded-sm", className)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ─── Category and volunteer ─────────────────────────────────────────────────

function CategoryBreakdown({ report }: { report: VolunteerHoursReport }) {
  if (report.categories.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">By category</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {report.categories.map((category) => (
          <div
            key={category.category ?? "uncategorized"}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm font-medium">
              {category.category
                ? categoryLabel(VOLUNTEER_CATEGORIES, category.category)
                : "Uncategorized"}
            </p>
            <p className="text-xl font-bold">{hrs(category.approvedHours)}</p>
            <p className="text-xs text-muted-foreground">
              {category.entryCount}{" "}
              {category.entryCount === 1 ? "entry" : "entries"}
              {category.pendingHours > 0 &&
                ` · ${hrs(category.pendingHours)} pending`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function VolunteerBreakdown({ report }: { report: VolunteerHoursReport }) {
  if (report.volunteers.length === 0) return null;

  return (
    <CollapsibleSection
      id="volunteer-hours-by-person"
      title="By volunteer"
      meta={`${report.volunteers.length} people · ${report.schoolYear}`}
      defaultExpanded
    >
      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3">Volunteer</th>
                <th className="p-3 text-right">Approved hours</th>
                <th className="p-3 text-right">Entries</th>
                <th className="p-3 text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {report.volunteers.map((person) => (
                <tr key={person.key} className="border-b border-border">
                  <td className="p-3">
                    <p className="font-medium">{person.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {person.email ?? "No email on file"}
                      {/* Worth saying plainly: this person can't see their own
                          total, and one line in the report is where somebody
                          notices and asks them for an address. */}
                      {!person.hasAccount && " · hasn't signed in"}
                    </p>
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {hrs(person.approvedHours)}
                  </td>
                  <td className="p-3 text-right">{person.entryCount}</td>
                  <td className="p-3 text-right text-muted-foreground">
                    {person.pendingHours > 0 ? hrs(person.pendingHours) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ─── Line by line ───────────────────────────────────────────────────────────

function EntryList({ report }: { report: VolunteerHoursReport }) {
  return (
    <CollapsibleSection
      id="volunteer-hours-entries"
      title="Every entry"
      meta={`${report.entries.length} logged · ${report.schoolYear}`}
    >
      {report.entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center">
          <p className="text-muted-foreground">
            No hours logged in {report.schoolYear}.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {report.entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{entry.volunteerName}</p>
                    <p className="text-sm">{entry.eventName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(entry.date)} ·{" "}
                      {categoryLabel(VOLUNTEER_CATEGORIES, entry.category)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{hrs(entry.hours)} hrs</p>
                    <Badge
                      variant={entry.approved ? "success" : "secondary"}
                      className="mt-1"
                    >
                      {entry.approved ? "Approved" : "Pending"}
                    </Badge>
                  </div>
                </div>
                {entry.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {entry.notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Date</th>
                    <th className="p-3">Volunteer</th>
                    <th className="p-3">Activity</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Hours</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-border">
                      <td className="whitespace-nowrap p-3">
                        {formatDate(entry.date)}
                      </td>
                      <td className="p-3">{entry.volunteerName}</td>
                      <td className="p-3">
                        {entry.eventName}
                        {entry.notes && (
                          <span className="block text-xs text-muted-foreground">
                            {entry.notes}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {categoryLabel(VOLUNTEER_CATEGORIES, entry.category)}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {hrs(entry.hours)}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={entry.approved ? "success" : "secondary"}
                        >
                          {entry.approved ? "Approved" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

// ─── The same four tables, as files ─────────────────────────────────────────

function buildReportFiles(report: VolunteerHoursReport): ReportFile[] {
  const stamp = report.schoolYear;

  return [
    {
      key: "detail",
      label: "Detail",
      filename: `volunteer-hours-${stamp}.csv`,
      csv: toCsv(
        [
          { key: "date", label: "Date" },
          { key: "volunteer", label: "Volunteer" },
          { key: "email", label: "Email" },
          { key: "activity", label: "Activity" },
          { key: "category", label: "Category" },
          { key: "hours", label: "Hours" },
          { key: "status", label: "Status" },
          { key: "notes", label: "Notes" },
        ],
        report.entries.map((entry) => ({
          date: entry.date,
          volunteer: entry.volunteerName,
          // Blank for a volunteer the board recorded by name alone — a real
          // answer, and the reason this column can't be assumed populated.
          email: entry.volunteerEmail ?? "",
          activity: entry.eventName,
          category: categoryLabel(VOLUNTEER_CATEGORIES, entry.category) ?? "",
          hours: hrs(entry.hours),
          status: entry.approved ? "Approved" : "Pending",
          notes: entry.notes ?? "",
        })),
        {
          notes: [
            `Volunteer hours logged at this school in ${stamp} (August 1 through July 31).`,
            `Approved: ${hrs(report.totals.approvedHours)} hours across ${report.totals.entryCount} entries from ${report.totals.volunteerCount} volunteers.`,
            `Pending approval: ${hrs(report.totals.pendingHours)} hours.`,
          ],
        }
      ),
    },
    {
      key: "months",
      label: "By month",
      filename: `volunteer-hours-by-month-${stamp}.csv`,
      csv: toCsv(
        [
          { key: "month", label: "Month" },
          { key: "hours", label: `Approved hours (${report.schoolYear})` },
          {
            key: "previousHours",
            label: `Approved hours (${report.previousSchoolYear})`,
          },
          { key: "entries", label: "Entries" },
          { key: "volunteers", label: "Volunteers" },
          { key: "pending", label: "Pending hours" },
        ],
        report.months.map((month) => ({
          month: month.label,
          hours: hrs(month.approvedHours),
          previousHours: hrs(month.previousApprovedHours),
          entries: String(month.entryCount),
          volunteers: String(month.volunteerCount),
          pending: hrs(month.pendingHours),
        })),
        {
          notes: [
            `Total approved ${stamp}: ${hrs(report.totals.approvedHours)} hours.`,
            `Total approved ${report.previousSchoolYear}: ${hrs(report.previousTotals.approvedHours)} hours.`,
          ],
        }
      ),
    },
    {
      key: "years",
      label: "By year",
      filename: "volunteer-hours-by-year.csv",
      csv: toCsv(
        [
          { key: "schoolYear", label: "School year" },
          { key: "hours", label: "Approved hours" },
          { key: "change", label: "Change vs prior year" },
          { key: "volunteers", label: "Volunteers" },
          { key: "entries", label: "Entries" },
          { key: "pending", label: "Pending hours" },
        ],
        report.years.map((year) => ({
          schoolYear: year.schoolYear,
          hours: hrs(year.approvedHours),
          change:
            year.previousApprovedHours === null
              ? ""
              : changeText(year.approvedHours, year.previousApprovedHours),
          volunteers: String(year.volunteerCount),
          entries: String(year.entryCount),
          pending: hrs(year.pendingHours),
        })),
        {
          notes: [
            "Every school year this school has logged volunteer hours in, newest first.",
            "A school year runs August 1 through July 31.",
          ],
        }
      ),
    },
    {
      key: "volunteers",
      label: "By volunteer",
      filename: `volunteer-hours-by-volunteer-${stamp}.csv`,
      csv: toCsv(
        [
          { key: "name", label: "Volunteer" },
          { key: "email", label: "Email" },
          { key: "hours", label: "Approved hours" },
          { key: "entries", label: "Entries" },
          { key: "pending", label: "Pending hours" },
        ],
        report.volunteers.map((person) => ({
          name: person.name,
          email: person.email ?? "",
          hours: hrs(person.approvedHours),
          entries: String(person.entryCount),
          pending: hrs(person.pendingHours),
        })),
        {
          notes: [
            `Approved volunteer hours per person, ${stamp}.`,
            `${report.totals.volunteerCount} volunteers, ${hrs(report.totals.approvedHours)} hours.`,
          ],
        }
      ),
    },
  ];
}
