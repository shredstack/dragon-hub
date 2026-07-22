import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the dashboard's panels.
 *
 * Every panel is the same shape — icon chip, title, optional count, optional
 * link out — so the page reads as one board rather than as a pile of unrelated
 * widgets. The tone accent is what makes it feel like a school app instead of
 * an admin console: blue for community, gold for the board's own work.
 */

export type SectionTone = "blue" | "gold" | "green";

const chipTones: Record<SectionTone, string> = {
  blue: "bg-dragon-blue-500/10 text-dragon-blue-500",
  gold: "bg-dragon-gold-400/20 text-dragon-gold-700",
  green: "bg-success/10 text-success",
};

export function SectionCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-sm",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  icon: Icon,
  title,
  count,
  tone = "blue",
  href,
  linkLabel = "View all",
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  tone?: SectionTone;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className={cn("rounded-xl p-2", chipTones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-dragon-blue-500 hover:text-dragon-blue-700"
        >
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

/**
 * The reward for having nothing to do. A blank panel reads as broken; a panel
 * that congratulates you reads as a system that's keeping track for you.
 */
export function AllClear({
  emoji,
  message,
}: {
  emoji: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-muted/60 px-4 py-8 text-center">
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
