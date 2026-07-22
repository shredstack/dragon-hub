import Link from "next/link";
import { CheckCircle2, Clock, ListChecks, School } from "lucide-react";
import type { ActionItem } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { AllClear, SectionCard, SectionHeading } from "./section";

interface NextStepsProps {
  items: ActionItem[];
  /** Hours the user logged that are still waiting on the board. */
  pendingHours: number;
  now: Date;
}

/**
 * The panel the dashboard exists for: everything with this user's name on it.
 *
 * Tasks come from two places (classroom lists and event plans) and are shown as
 * one list, because "what do I owe someone" is a single question. Sorted by due
 * date, so the top row is always the next thing that matters.
 */
export function NextSteps({ items, pendingHours, now }: NextStepsProps) {
  const hasAnything = items.length > 0 || pendingHours > 0;

  return (
    <SectionCard>
      <SectionHeading
        icon={ListChecks}
        title="Your next steps"
        count={items.length}
        tone="blue"
      />

      {!hasAnything ? (
        <AllClear
          emoji="🎉"
          message="Nothing on your plate. Enjoy it while it lasts!"
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.source}-${item.id}`}>
              <Link
                href={item.href}
                className="flex items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-dragon-blue-300 hover:bg-dragon-blue-50"
              >
                <span className="mt-0.5 rounded-lg bg-muted p-1.5 text-muted-foreground">
                  {item.source === "classroom" ? (
                    <School className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.context}
                  </span>
                </span>
                <DueBadge dueDate={item.dueDate} now={now} />
              </Link>
            </li>
          ))}

          {pendingHours > 0 && (
            <li>
              <Link
                href="/volunteer-hours"
                className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3 transition-colors hover:border-dragon-blue-300 hover:bg-dragon-blue-50"
              >
                <span className="rounded-lg bg-dragon-gold-400/20 p-1.5 text-dragon-gold-700">
                  <Clock className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">
                    {pendingHours} {pendingHours === 1 ? "entry" : "entries"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    waiting on board approval
                  </span>
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Urgency the user can read at a glance, without doing date math. */
function DueBadge({ dueDate, now }: { dueDate: Date | null; now: Date }) {
  if (!dueDate) {
    return <span className="text-xs text-muted-foreground">No date</span>;
  }

  // Compare calendar days rather than instants, so something due at 9am today
  // is "Today" all day instead of flipping to "Overdue" at 9:01.
  const days = Math.round(
    (startOfDay(dueDate).getTime() - startOfDay(now).getTime()) / DAY_MS
  );

  const label =
    days < 0
      ? `${Math.abs(days)}d late`
      : days === 0
        ? "Today"
        : days === 1
          ? "Tomorrow"
          : `${days}d`;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
        days < 0
          ? "bg-destructive/10 text-destructive"
          : days <= 3
            ? "bg-dragon-gold-400/25 text-dragon-gold-700"
            : "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
