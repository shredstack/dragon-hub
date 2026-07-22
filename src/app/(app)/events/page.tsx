import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventPlans,
  eventPlanMembers,
  users,
} from "@/lib/db/schema";
import { and, eq, or, sql, desc, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getCurrentSchoolId, isPtaBoard } from "@/lib/auth-helpers";
import { getSchoolCurrentYear, parseSchoolYear } from "@/lib/school-year";
import { EventPlanCard } from "@/components/event-plans/event-plan-card";
import {
  EventPlanListFilter,
  type EventPlanYearFilter,
} from "@/components/event-plans/event-plan-list-filter";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { EventPlanStatus } from "@/types";

interface EventsPageProps {
  searchParams: Promise<{ filter?: string; year?: string }>;
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { filter, year } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [isBoardMember, schoolYear] = await Promise.all([
    isPtaBoard(userId),
    getSchoolCurrentYear(schoolId),
  ]);

  const yearFilter: EventPlanYearFilter =
    year === "previous" ? "previous" : "current";

  // Event plans are closed by default — the board sees the school's whole
  // slate, everyone else sees only the plans they were invited onto. Someone
  // with neither has no business on this page at all, so it 404s rather than
  // rendering an empty list that implies there's nothing to see.
  const userMemberships = await db.query.eventPlanMembers.findMany({
    where: eq(eventPlanMembers.userId, userId),
    columns: { eventPlanId: true },
  });
  const userPlanIds = new Set(userMemberships.map((m) => m.eventPlanId));

  const visibleToUser = isBoardMember
    ? eq(eventPlans.schoolId, schoolId)
    : and(
        eq(eventPlans.schoolId, schoolId),
        or(
          eq(eventPlans.createdBy, userId),
          // A creator is always added as a lead, so this covers the normal
          // case; the createdBy check is the backstop for a missing row.
          userPlanIds.size > 0
            ? inArray(eventPlans.id, [...userPlanIds])
            : sql`false`
        )
      );

  // Fetch the event plans this user may see, with aggregated data
  const plans = await db
    .select({
      id: eventPlans.id,
      title: eventPlans.title,
      description: eventPlans.description,
      eventType: eventPlans.eventType,
      eventDate: eventPlans.eventDate,
      status: eventPlans.status,
      schoolYear: eventPlans.schoolYear,
      createdBy: eventPlans.createdBy,
      creatorName: users.name,
      createdAt: eventPlans.createdAt,
      memberCount: sql<number>`(select count(*) from event_plan_members where event_plan_id = ${eventPlans.id})`,
      taskCount: sql<number>`(select count(*) from event_plan_tasks where event_plan_id = ${eventPlans.id})`,
      completedTaskCount: sql<number>`(select count(*) from event_plan_tasks where event_plan_id = ${eventPlans.id} and completed = true)`,
    })
    .from(eventPlans)
    .leftJoin(users, eq(eventPlans.createdBy, users.id))
    .where(visibleToUser)
    .orderBy(desc(eventPlans.createdAt));

  if (plans.length === 0 && !isBoardMember) notFound();

  // Fetch leads for the plans shown above
  const allLeads = await db
    .select({
      eventPlanId: eventPlanMembers.eventPlanId,
      userName: users.name,
    })
    .from(eventPlanMembers)
    .innerJoin(users, eq(eventPlanMembers.userId, users.id))
    .innerJoin(eventPlans, eq(eventPlanMembers.eventPlanId, eventPlans.id))
    .where(and(eq(eventPlanMembers.role, "lead"), visibleToUser));

  const leadsByPlan = new Map<string, string[]>();
  for (const lead of allLeads) {
    const existing = leadsByPlan.get(lead.eventPlanId) || [];
    if (lead.userName) existing.push(lead.userName);
    leadsByPlan.set(lead.eventPlanId, existing);
  }

  // Creator is also a "member" for filtering
  const userCreatedIds = new Set(
    plans.filter((p) => p.createdBy === userId).map((p) => p.id)
  );

  // Year first, so every scope tab and the pending count agree on the period
  // being viewed. A plan dated ahead of the school's active year counts as
  // current rather than disappearing from both tabs.
  const currentYearStart = parseSchoolYear(schoolYear);
  const plansForYear = plans.filter((p) => {
    // If the school's own year is unreadable there's nothing to compare
    // against, and sorting every plan into "previous" would empty the page.
    if (Number.isNaN(currentYearStart)) return yearFilter === "current";
    const planStart = parseSchoolYear(p.schoolYear);
    // An unparseable year is treated as current so the plan is never orphaned.
    if (Number.isNaN(planStart)) return yearFilter === "current";
    return yearFilter === "current"
      ? planStart >= currentYearStart
      : planStart < currentYearStart;
  });

  let filteredPlans = plansForYear;
  if (filter === "my") {
    filteredPlans = plansForYear.filter(
      (p) => userPlanIds.has(p.id) || userCreatedIds.has(p.id)
    );
  } else if (filter === "pending" && isBoardMember) {
    filteredPlans = plansForYear.filter((p) => p.status === "pending_approval");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Plans</h1>
          <p className="text-muted-foreground">
            {isBoardMember
              ? "Plan and organize PTA events together"
              : "The events you've been added to"}
          </p>
        </div>
        {isBoardMember && (
          <Link href="/events/new">
            <Button>
              <Plus className="h-4 w-4" /> New Event Plan
            </Button>
          </Link>
        )}
      </div>

      <EventPlanListFilter
        currentFilter={filter || "all"}
        yearFilter={yearFilter}
        schoolYear={schoolYear}
        isBoardMember={isBoardMember}
        pendingCount={
          plansForYear.filter((p) => p.status === "pending_approval").length
        }
      />

      {filteredPlans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">
            {yearFilter === "previous"
              ? "No event plans from previous years"
              : "No event plans yet"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {yearFilter === "previous"
              ? `Plans from ${schoolYear} appear under Current Year.`
              : isBoardMember
                ? "Create your first event plan to get started."
                : "You'll see an event here once a PTA board member adds you to it."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPlans.map((plan) => (
            <EventPlanCard
              key={plan.id}
              plan={{
                id: plan.id,
                title: plan.title,
                eventType: plan.eventType,
                eventDate: plan.eventDate?.toISOString() ?? null,
                status: plan.status as EventPlanStatus,
                creatorName: plan.creatorName,
              }}
              memberCount={Number(plan.memberCount)}
              taskCount={Number(plan.taskCount)}
              completedTaskCount={Number(plan.completedTaskCount)}
              leads={leadsByPlan.get(plan.id) || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
