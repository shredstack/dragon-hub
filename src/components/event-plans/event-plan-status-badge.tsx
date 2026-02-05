import { Badge } from "@/components/ui/badge";
import { EVENT_PLAN_STATUSES } from "@/lib/constants";
import type { EventPlanStatus } from "@/types";

const statusVariants: Record<EventPlanStatus, "default" | "secondary" | "success" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_approval: "outline",
  approved: "success",
  rejected: "destructive",
  completed: "default",
};

export function EventPlanStatusBadge({ status }: { status: EventPlanStatus }) {
  return (
    <Badge variant={statusVariants[status]}>
      {EVENT_PLAN_STATUSES[status]}
    </Badge>
  );
}
