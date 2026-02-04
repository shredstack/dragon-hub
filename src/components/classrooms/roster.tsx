import { Badge } from "@/components/ui/badge";
import { USER_ROLES } from "@/lib/constants";

interface RosterProps {
  members: {
    userId: string;
    userName: string;
    role: string;
    user: { name: string | null; email: string };
  }[];
}

export function Roster({ members }: RosterProps) {
  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div key={member.userId} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
          <div>
            <p className="text-sm font-medium">{member.user.name ?? member.user.email}</p>
            <p className="text-xs text-muted-foreground">{member.user.email}</p>
          </div>
          <Badge variant="secondary">
            {USER_ROLES[member.role as keyof typeof USER_ROLES] ?? member.role}
          </Badge>
        </div>
      ))}
    </div>
  );
}
