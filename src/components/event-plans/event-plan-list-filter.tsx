"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface EventPlanListFilterProps {
  currentFilter: string;
  isBoardMember: boolean;
  pendingCount: number;
}

export function EventPlanListFilter({
  currentFilter,
  isBoardMember,
  pendingCount,
}: EventPlanListFilterProps) {
  const filters = [
    { key: "all", label: "All Events", href: "/events" },
    { key: "my", label: "My Events", href: "/events?filter=my" },
    ...(isBoardMember
      ? [
          {
            key: "pending",
            label: `Pending Approval${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
            href: "/events?filter=pending",
          },
        ]
      : []),
  ];

  return (
    <div className="mb-4 flex gap-1 rounded-lg border border-border bg-card p-1">
      {filters.map((f) => (
        <Link
          key={f.key}
          href={f.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            currentFilter === f.key
              ? "bg-dragon-blue-500 text-white"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );
}
