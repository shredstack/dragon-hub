"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type EventPlanYearFilter = "current" | "previous";

interface EventPlanListFilterProps {
  currentFilter: string;
  yearFilter: EventPlanYearFilter;
  /** The school's active year, e.g. "2025-2026" — shown so the tab isn't vague. */
  schoolYear: string;
  isBoardMember: boolean;
  pendingCount: number;
}

/**
 * Two independent axes: which plans (all / mine / awaiting my vote) and which
 * years. They compose, so "My Events" in "Previous Years" is what you'd expect
 * — the plans you ran last year — rather than resetting the other choice.
 */
export function EventPlanListFilter({
  currentFilter,
  yearFilter,
  schoolYear,
  isBoardMember,
  pendingCount,
}: EventPlanListFilterProps) {
  // Both defaults stay out of the URL so /events is the canonical entry point.
  function href(next: { filter?: string; year?: EventPlanYearFilter }) {
    const filter = next.filter ?? currentFilter;
    const year = next.year ?? yearFilter;
    const params = new URLSearchParams();
    if (filter && filter !== "all") params.set("filter", filter);
    if (year !== "current") params.set("year", year);
    const query = params.toString();
    return query ? `/events?${query}` : "/events";
  }

  const scopeTabs = [
    { key: "all", label: "All Events", href: href({ filter: "all" }) },
    { key: "my", label: "My Events", href: href({ filter: "my" }) },
    ...(isBoardMember
      ? [
          {
            key: "pending",
            label: `Pending Approval${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
            href: href({ filter: "pending" }),
          },
        ]
      : []),
  ];

  const yearTabs: { key: EventPlanYearFilter; label: string }[] = [
    { key: "current", label: `Current Year (${schoolYear})` },
    { key: "previous", label: "Previous Years" },
  ];

  return (
    <div className="mb-4 space-y-2">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {scopeTabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              currentFilter === tab.key
                ? "bg-dragon-blue-500 text-white"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {yearTabs.map((tab) => (
          <Link
            key={tab.key}
            href={href({ year: tab.key })}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              yearFilter === tab.key
                ? "bg-dragon-blue-500 text-white"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
