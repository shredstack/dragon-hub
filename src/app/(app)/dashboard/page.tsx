import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classroomMembers, classrooms, volunteerHours, calendarEvents, fundraisers, eventPlanMembers, eventPlans } from "@/lib/db/schema";
import { eq, and, gte, or, sql } from "drizzle-orm";
import { School, Clock, Calendar, Heart, ClipboardList } from "lucide-react";
import {
  canAccessEventPlans,
  getCurrentSchoolId,
  getUserSchoolMembership,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear, parseSchoolYear } from "@/lib/school-year";
import { canViewModule } from "@/lib/module-visibility";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return null;

  // Get user's school membership
  const schoolMembership = await getUserSchoolMembership(userId);

  // Every tile links somewhere, so every count has to be scoped exactly the way
  // its destination page is scoped — otherwise the tile promises rows the page
  // then filters away. School and school year are the two scopes that matter:
  // each school year gets its own classroom and event plan rows, and the data
  // tables are shared across schools.
  const schoolId = await getCurrentSchoolId();
  const schoolYear = schoolId ? await getSchoolCurrentYear(schoolId) : null;
  const currentYearStart = schoolYear ? parseSchoolYear(schoolYear) : NaN;

  const [classroomCount, pendingHours, upcomingEvents, activeFundraisers, myEventPlans] =
    await Promise.all([
      // Mirrors /classrooms: this year's active rooms only.
      db
        .select({ count: sql<number>`count(*)` })
        .from(classroomMembers)
        .innerJoin(classrooms, eq(classrooms.id, classroomMembers.classroomId))
        .where(
          and(
            eq(classroomMembers.userId, userId),
            eq(classrooms.active, true),
            schoolYear ? eq(classrooms.schoolYear, schoolYear) : undefined
          )
        )
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(volunteerHours)
        .where(
          and(
            eq(volunteerHours.userId, userId),
            eq(volunteerHours.approved, false)
          )
        )
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(calendarEvents)
        .where(
          and(
            gte(calendarEvents.startTime, new Date()),
            schoolId ? eq(calendarEvents.schoolId, schoolId) : undefined
          )
        )
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(fundraisers)
        .where(
          and(
            eq(fundraisers.active, true),
            schoolId ? eq(fundraisers.schoolId, schoolId) : undefined
          )
        )
        .then((r) => Number(r[0]?.count ?? 0)),
      // Mirrors /events?filter=my, which defaults to the current-year tab. An
      // unparseable year on either side counts as current there, so plans are
      // never orphaned; the same rule applies here.
      db
        .select({
          id: eventPlans.id,
          schoolYear: eventPlans.schoolYear,
        })
        .from(eventPlans)
        .leftJoin(
          eventPlanMembers,
          eq(eventPlans.id, eventPlanMembers.eventPlanId)
        )
        .where(
          and(
            schoolId ? eq(eventPlans.schoolId, schoolId) : undefined,
            or(
              eq(eventPlans.createdBy, userId),
              eq(eventPlanMembers.userId, userId)
            )
          )
        )
        .groupBy(eventPlans.id)
        .then(
          (rows) =>
            rows.filter((p) => {
              if (Number.isNaN(currentYearStart)) return true;
              const planStart = parseSchoolYear(p.schoolYear);
              return Number.isNaN(planStart) || planStart >= currentYearStart;
            }).length
        ),
    ]);

  // Event plans are invite-only, so for most members this tile would read "0"
  // and 404 on click. It appears only for people the area is open to.
  const showEventPlans = schoolMembership?.schoolId
    ? await canAccessEventPlans(userId, schoolMembership.schoolId)
    : false;

  // Same reasoning for Fundraisers: a school can hide it from members, and a
  // tile linking somewhere they'd be redirected away from is just confusing.
  const showFundraisers = await canViewModule(
    userId,
    schoolMembership?.schoolId,
    "fundraisers"
  );

  const stats = [
    {
      label: "My Classrooms",
      value: classroomCount,
      icon: School,
      href: "/classrooms",
    },
    {
      label: "Pending Hours",
      value: pendingHours,
      icon: Clock,
      href: "/volunteer-hours",
    },
    {
      label: "Upcoming Events",
      value: upcomingEvents,
      icon: Calendar,
      href: "/calendar",
    },
    ...(showFundraisers
      ? [
          {
            label: "Active Fundraisers",
            value: activeFundraisers,
            icon: Heart,
            href: "/fundraisers",
          },
        ]
      : []),
    ...(showEventPlans
      ? [
          {
            label: "My Event Plans",
            value: myEventPlans,
            icon: ClipboardList,
            href: "/events?filter=my",
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening at {schoolMembership?.school?.name || "your school"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <a
            key={stat.label}
            href={stat.href}
            className="rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-3xl font-bold">{stat.value}</p>
              </div>
              <stat.icon className="h-8 w-8 text-dragon-blue-400" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
