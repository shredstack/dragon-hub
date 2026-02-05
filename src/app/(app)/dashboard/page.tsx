import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classroomMembers, volunteerHours, calendarEvents, fundraisers, eventPlanMembers, eventPlans } from "@/lib/db/schema";
import { eq, and, gte, or, sql } from "drizzle-orm";
import { School, Clock, Calendar, Heart, ClipboardList } from "lucide-react";
import { getUserSchoolMembership } from "@/lib/auth-helpers";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return null;

  // Get user's school membership
  const schoolMembership = await getUserSchoolMembership(userId);

  const [classroomCount, pendingHours, upcomingEvents, activeFundraisers, myEventPlans] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(classroomMembers)
        .where(eq(classroomMembers.userId, userId))
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
        .where(gte(calendarEvents.startTime, new Date()))
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(fundraisers)
        .where(eq(fundraisers.active, true))
        .then((r) => Number(r[0]?.count ?? 0)),
      db
        .select({ count: sql<number>`count(distinct ${eventPlans.id})` })
        .from(eventPlans)
        .leftJoin(
          eventPlanMembers,
          eq(eventPlans.id, eventPlanMembers.eventPlanId)
        )
        .where(
          or(
            eq(eventPlans.createdBy, userId),
            eq(eventPlanMembers.userId, userId)
          )
        )
        .then((r) => Number(r[0]?.count ?? 0)),
    ]);

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
    {
      label: "Active Fundraisers",
      value: activeFundraisers,
      icon: Heart,
      href: "/fundraisers",
    },
    {
      label: "My Event Plans",
      value: myEventPlans,
      icon: ClipboardList,
      href: "/events?filter=my",
    },
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
