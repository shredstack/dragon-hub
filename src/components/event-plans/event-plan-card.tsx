import Link from "next/link";
import { ClipboardList, Users, CalendarDays, CheckSquare } from "lucide-react";
import { EventPlanStatusBadge } from "./event-plan-status-badge";
import { formatDate } from "@/lib/utils";
import type { EventPlanStatus } from "@/types";

interface EventPlanCardProps {
  plan: {
    id: string;
    title: string;
    eventType: string | null;
    eventDate: string | null;
    status: EventPlanStatus;
    creatorName: string | null;
  };
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
  leads: string[];
}

export function EventPlanCard({
  plan,
  memberCount,
  taskCount,
  completedTaskCount,
  leads,
}: EventPlanCardProps) {
  const progress = taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0;

  return (
    <Link
      href={`/events/${plan.id}`}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all hover:border-dragon-blue-400 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-dragon-blue-100 text-dragon-blue-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold group-hover:text-dragon-blue-600">
              {plan.title}
            </h3>
            {plan.eventType && (
              <p className="text-xs capitalize text-muted-foreground">
                {plan.eventType}
              </p>
            )}
          </div>
        </div>
        <EventPlanStatusBadge status={plan.status} />
      </div>

      {plan.eventDate && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{formatDate(plan.eventDate)}</span>
        </div>
      )}

      {leads.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Led by {leads.join(", ")}
        </p>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span>
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
        {taskCount > 0 && (
          <div className="flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" />
            <span>
              {completedTaskCount}/{taskCount} tasks
            </span>
          </div>
        )}
      </div>

      {taskCount > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-dragon-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Link>
  );
}
