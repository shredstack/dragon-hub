import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  ClipboardCheck,
  GraduationCap,
  Sparkles,
  ThumbsUp,
  UserRoundSearch,
} from "lucide-react";
import type { BoardQueue } from "@/lib/dashboard-data";
import { AllClear } from "./section";

/**
 * The board's own queue — the things that stall the whole PTA if nobody clears
 * them.
 *
 * This sits above the personal panels for board members because their bottleneck
 * isn't their own to-do list, it's the approvals and unfilled roles that other
 * people are waiting on. Each row is a live count with a link straight to the
 * screen that clears it; nothing here is a vanity number.
 */
export function BoardConsole({
  queue,
  positionLabel,
}: {
  queue: BoardQueue;
  positionLabel?: string;
}) {
  const rows = [
    queue.hoursAwaitingApproval > 0 && {
      key: "hours",
      icon: ClipboardCheck,
      count: queue.hoursAwaitingApproval,
      label:
        queue.hoursAwaitingApproval === 1
          ? "volunteer hour entry to approve"
          : "volunteer hour entries to approve",
      detail: "Parents don't get credit until you do.",
      href: "/admin/volunteer-hours",
    },
    queue.plansAwaitingMyVote.length > 0 && {
      key: "votes",
      icon: ThumbsUp,
      count: queue.plansAwaitingMyVote.length,
      label:
        queue.plansAwaitingMyVote.length === 1
          ? "event plan needs your vote"
          : "event plans need your vote",
      detail: queue.plansAwaitingMyVote
        .slice(0, 3)
        .map((p) => p.title)
        .join(" · "),
      href: "/events?filter=pending",
    },
    // Two rows rather than one blended count, because they're answered by
    // different halves of Plan the Year: generating this year's plans, then
    // handing them out. An event with no plan yet can't need a lead.
    queue.eventSetup.unplanned.length > 0 && {
      key: "unplanned",
      icon: CalendarPlus,
      count: queue.eventSetup.unplanned.length,
      label:
        queue.eventSetup.unplanned.length === 1
          ? "recurring event has no plan this year"
          : "recurring events have no plan this year",
      detail: queue.eventSetup.unplanned
        .slice(0, 3)
        .map((e) => e.title)
        .join(" · "),
      href: "/admin/board/event-plan-setup",
    },
    queue.eventSetup.unassigned.length > 0 && {
      key: "leads",
      icon: UserRoundSearch,
      count: queue.eventSetup.unassigned.length,
      label:
        queue.eventSetup.unassigned.length === 1
          ? "event plan still needs a lead"
          : "event plans still need leads",
      detail: queue.eventSetup.unassigned
        .slice(0, 3)
        .map((e) => e.title)
        .join(" · "),
      href: "/admin/board/event-plan-setup",
    },
  ].filter(Boolean) as {
    key: string;
    icon: typeof ClipboardCheck;
    count: number;
    label: string;
    detail: string;
    href: string;
  }[];

  const onboarding = queue.onboarding;
  const onboardingIncomplete =
    onboarding && onboarding.completed < onboarding.total;

  return (
    <section className="rounded-2xl border border-dragon-gold-300 bg-gradient-to-br from-dragon-gold-50 to-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="rounded-xl bg-dragon-gold-400/30 p-2 text-dragon-gold-700">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Board desk</h2>
            <p className="text-xs text-muted-foreground">
              {positionLabel
                ? `Waiting on you, ${positionLabel}`
                : "Waiting on the board"}
            </p>
          </div>
        </div>
        <Link
          href="/admin/board"
          className="inline-flex items-center gap-1 text-sm font-medium text-dragon-blue-500 hover:text-dragon-blue-700"
        >
          PTA Board Hub
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <AllClear
          emoji="🐉"
          message="The board queue is clear. That's a good week."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.key}>
              <Link
                href={row.href}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <span className="rounded-lg bg-dragon-blue-500/10 p-1.5 text-dragon-blue-500">
                    <row.icon className="h-4 w-4" />
                  </span>
                  <span className="text-2xl font-bold leading-none">
                    {row.count}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium">{row.label}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {row.detail}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {onboardingIncomplete && (
        <Link
          href="/onboarding"
          className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-dragon-blue-300"
        >
          <span className="rounded-lg bg-dragon-blue-500/10 p-1.5 text-dragon-blue-500">
            <GraduationCap className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              Your onboarding: {onboarding.completed} of {onboarding.total} done
            </span>
            <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-dragon-gold-400"
                style={{
                  width: `${Math.round(
                    (onboarding.completed / onboarding.total) * 100
                  )}%`,
                }}
              />
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </section>
  );
}
