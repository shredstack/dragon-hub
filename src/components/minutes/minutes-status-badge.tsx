import { Badge } from "@/components/ui/badge";

interface MinutesStatusBadgeProps {
  status: "pending" | "approved";
}

export function MinutesStatusBadge({ status }: MinutesStatusBadgeProps) {
  return (
    <Badge variant={status === "approved" ? "default" : "secondary"}>
      {status === "approved" ? "Approved" : "Pending"}
    </Badge>
  );
}
