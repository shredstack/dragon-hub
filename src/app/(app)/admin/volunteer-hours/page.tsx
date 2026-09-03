import Link from "next/link";
import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { volunteerHours, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { formatDate, cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/categories";
import { VOLUNTEER_CATEGORIES } from "@/lib/constants";
import {
  getSchoolCurrentYear,
  getSchoolYearOptions,
  isValidSchoolYear,
  sortSchoolYearsDesc,
} from "@/lib/school-year";
import {
  pendingHoursFilter,
  volunteerDisplayEmail,
  volunteerDisplayName,
} from "@/lib/volunteer-hours-queue";
import { getVolunteerHoursReport } from "@/lib/volunteer-hours-report";
import { getSchoolActivityOptions } from "@/lib/volunteer-hours-entry";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { todayDateOnly } from "@/lib/date-only";
import { ApprovalActions } from "./approval-actions";
import { ApproveAllButton } from "./approve-all-button";
import { AddHoursForm } from "./add-hours-form";
import { VolunteerHoursReportView } from "./report-view";

export const metadata = { title: "Manage Volunteer Hours" };

interface PageProps {
  searchParams: Promise<{ tab?: string; year?: string }>;
}

/**
 * Two jobs on one page: clearing the queue, and answering for the year.
 *
 * They were separate concerns until the board asked the same question of both —
 * "how are we doing on volunteer hours" — and it turned out the secretary was
 * pulling the answer out of a spreadsheet she maintained by hand beside this
 * page. So the report lives behind a tab here rather than as its own hub card:
 * the person who approves the hours is the person who reports them.
 *
 * Tab and year both live in the URL, which keeps the whole page a server
 * component and makes last year's numbers a link the secretary can send.
 */
export default async function AdminVolunteerHoursPage({
  searchParams,
}: PageProps) {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  // `approveHours`/`rejectHours` both scope their write to the current school,
  // so an unscoped list rendered other schools' rows with buttons that silently
  // did nothing. Scope the read to match the write.
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const params = await searchParams;
  const tab =
    params.tab === "reports" || params.tab === "add" ? params.tab : "pending";

  const [pendingHours, currentYear, configuredYears] = await Promise.all([
    db
      .select({
        id: volunteerHours.id,
        eventName: volunteerHours.eventName,
        hours: volunteerHours.hours,
        date: volunteerHours.date,
        category: volunteerHours.category,
        userName: volunteerDisplayName,
        userEmail: volunteerDisplayEmail,
      })
      .from(volunteerHours)
      // Left, not inner: a row the board entered for someone with no account is
      // still a row somebody has to approve, and an inner join hides it from
      // the queue while leaving it pending forever.
      .leftJoin(users, eq(volunteerHours.userId, users.id))
      .where(pendingHoursFilter(schoolId))
      .orderBy(desc(volunteerHours.date)),
    getSchoolCurrentYear(schoolId),
    getSchoolYearOptions(schoolId),
  ]);

  // A year in the URL is honoured whether or not it's on the school's slate —
  // a school that trimmed `availableSchoolYears` still has the hours, and a
  // report that refuses to show them is a report with a hole in it.
  const selectedYear =
    params.year && isValidSchoolYear(params.year) ? params.year : currentYear;

  const report =
    tab === "reports"
      ? await getVolunteerHoursReport(schoolId, selectedYear)
      : null;

  // The school's zone, not the server's: on Vercel a Denver school is already
  // tomorrow from 6pm, and a form that opens on the wrong day puts a whole
  // sheet of hours in the wrong month.
  const entry =
    tab === "add"
      ? await (async () => {
          const [activityOptions, timeZone] = await Promise.all([
            getSchoolActivityOptions(schoolId),
            getSchoolTimeZone(schoolId),
          ]);
          return { activityOptions, today: todayDateOnly(timeZone) };
        })()
      : null;

  const availableYears = report
    ? sortSchoolYearsDesc([
        ...new Set([
          ...configuredYears,
          ...report.years.map((year) => year.schoolYear),
          selectedYear,
        ]),
      ])
    : [];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Volunteer Hours</h1>
          <p className="text-muted-foreground">
            Enter hours off the meeting sheet, approve what parents have logged,
            and report on the year.
          </p>
        </div>
        {tab === "pending" && (
          <ApproveAllButton pendingCount={pendingHours.length} />
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        <TabLink href="/admin/volunteer-hours?tab=pending" active={tab === "pending"}>
          Pending approval
          {pendingHours.length > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {pendingHours.length}
            </span>
          )}
        </TabLink>
        <TabLink href="/admin/volunteer-hours?tab=add" active={tab === "add"}>
          Add hours
        </TabLink>
        <TabLink href="/admin/volunteer-hours?tab=reports" active={tab === "reports"}>
          Reports
        </TabLink>
      </div>

      {tab === "add" && entry ? (
        <>
          <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
            For the sheet that goes round at the monthly meeting. Start typing a
            name to find someone who&apos;s already here, or just enter a new
            one — an email address is optional, and if you give one we&apos;ll
            send them a link to sign in and see their hours.
          </p>
          <AddHoursForm
            options={entry.activityOptions}
            today={entry.today}
          />
        </>
      ) : tab === "reports" && report ? (
        <VolunteerHoursReportView
          report={report}
          availableYears={availableYears}
          currentYear={currentYear}
        />
      ) : pendingHours.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">No pending hours to approve.</p>
          <Link
            href="/admin/volunteer-hours?tab=reports"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            See the year&apos;s totals
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {pendingHours.map((h) => (
              <div
                key={h.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{h.userName ?? h.userEmail}</p>
                    <p className="text-sm">{h.eventName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(h.date)} · {categoryLabel(VOLUNTEER_CATEGORIES, h.category)}
                    </p>
                  </div>
                  <p className="font-semibold">{h.hours} hrs</p>
                </div>
                <div className="mt-3">
                  <ApprovalActions hourId={h.id} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Volunteer</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">Hours</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingHours.map((h) => (
                    <tr key={h.id} className="border-b border-border">
                      <td className="p-3">{h.userName ?? h.userEmail}</td>
                      <td className="p-3">{h.eventName}</td>
                      <td className="p-3">{h.hours}</td>
                      <td className="p-3">{formatDate(h.date)}</td>
                      <td className="p-3">
                        {categoryLabel(VOLUNTEER_CATEGORIES, h.category)}
                      </td>
                      <td className="p-3">
                        <ApprovalActions hourId={h.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px flex items-center border-b-2 px-3 py-2 text-sm font-medium",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}
