import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  Mail,
  NotebookPen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface QuickAction {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  emoji: string;
}

const memberActions: QuickAction[] = [
  {
    href: "/volunteer-hours/submit",
    icon: Clock,
    label: "Log hours",
    hint: "Takes about a minute",
    emoji: "⏱️",
  },
  {
    href: "/knowledge",
    icon: BookOpen,
    label: "Ask a question",
    hint: "Answers from our own records",
    emoji: "💡",
  },
  {
    href: "/calendar",
    icon: CalendarDays,
    label: "School calendar",
    hint: "Everything in one place",
    emoji: "📅",
  },
];

const boardActions: QuickAction[] = [
  {
    href: "/events",
    icon: ClipboardList,
    label: "Event plans",
    hint: "Tasks, budgets, and leads",
    emoji: "🎪",
  },
  {
    href: "/emails/submit",
    icon: Mail,
    label: "Add to the email",
    hint: "Goes in this week's send",
    emoji: "✉️",
  },
  {
    href: "/minutes",
    icon: NotebookPen,
    label: "Minutes & agendas",
    hint: "What we decided, and when",
    emoji: "📝",
  },
];

/**
 * The short list of things people actually come here to do.
 *
 * Board members get their three on top of everyone's three rather than instead
 * of them — a board member is still a parent with hours to log.
 */
export function QuickActions({ isBoardMember }: { isBoardMember: boolean }) {
  const actions = isBoardMember
    ? [...memberActions, ...boardActions]
    : memberActions;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-dragon-blue-300 hover:shadow-md"
        >
          <span
            className="text-2xl transition-transform group-hover:scale-110"
            aria-hidden
          >
            {action.emoji}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {action.label}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {action.hint}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
