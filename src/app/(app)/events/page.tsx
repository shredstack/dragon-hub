import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  eventPlans,
  eventPlanMembers,
  users,
} from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { isPtaBoard } from "@/lib/auth-helpers";
import { EventPlanCard } from "@/components/event-plans/event-plan-card";
import { EventPlanListFilter } from "@/components/event-plans/event-plan-list-filter";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { EventPlanStatus } from "@/types";

interface EventsPageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { filter } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const isBoardMember = await isPtaBoard(userId);

  // Fetch all event plans with aggregated data
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
    .orderBy(desc(eventPlans.createdAt));

  // Fetch leads for all plans
  const allLeads = await db
    .select({
      eventPlanId: eventPlanMembers.eventPlanId,
      userName: users.name,
    })
    .from(eventPlanMembers)
    .innerJoin(users, eq(eventPlanMembers.userId, users.id))
    .where(eq(eventPlanMembers.role, "lead"));

  const leadsByPlan = new Map<string, string[]>();
  for (const lead of allLeads) {
    const existing = leadsByPlan.get(lead.eventPlanId) || [];
    if (lead.userName) existing.push(lead.userName);
    leadsByPlan.set(lead.eventPlanId, existing);
  }

  // Get user's memberships for filtering
  const userMemberships = await db.query.eventPlanMembers.findMany({
    where: eq(eventPlanMembers.userId, userId),
  });
  const userPlanIds = new Set(userMemberships.map((m) => m.eventPlanId));
  // Creator is also a "member" for filtering
  const userCreatedIds = new Set(
    plans.filter((p) => p.createdBy === userId).map((p) => p.id)
  );

  let filteredPlans = plans;
  if (filter === "my") {
    filteredPlans = plans.filter(
      (p) => userPlanIds.has(p.id) || userCreatedIds.has(p.id)
    );
  } else if (filter === "pending" && isBoardMember) {
    filteredPlans = plans.filter((p) => p.status === "pending_approval");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Plans</h1>
          <p className="text-muted-foreground">
            Plan and organize PTA events together
          </p>
        </div>
        <Link href="/events/new">
          <Button>
            <Plus className="h-4 w-4" /> New Event Plan
          </Button>
        </Link>
      </div>

      <EventPlanListFilter
        currentFilter={filter || "all"}
        isBoardMember={isBoardMember}
        pendingCount={
          plans.filter((p) => p.status === "pending_approval").length
        }
      />

      {filteredPlans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">No event plans yet</h2>
          <p className="text-sm text-muted-foreground">
            Create your first event plan to get started.
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
