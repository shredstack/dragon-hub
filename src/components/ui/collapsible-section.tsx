"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  readSectionExpanded,
  writeSectionExpanded,
} from "@/lib/section-collapse";

/**
 * A page section that collapses on phones and stays open on wider screens.
 *
 * The default state is CSS, not JavaScript: collapsed content renders as
 * `hidden md:block`, so the server's HTML is already right at both widths.
 * Nothing measures the viewport and nothing shifts after hydration — which is
 * what a `useMediaQuery` version of this would do on every phone load, since
 * the server has no way to know the width.
 *
 * Consequences of that choice, both intended:
 * - The desktop layout is untouched. Toggling only exists below `md`, where a
 *   one-column page makes a long section a scrolling problem.
 * - What the user opens is remembered across visits (see `section-collapse.ts`),
 *   but only ever applied on mobile, because that's the only place it can act.
 */
interface CollapsibleSectionProps {
  /**
   * Stable key this section is remembered under. Derive it from something that
   * doesn't move — a section title or a fixed slug, not an array index.
   */
  id: string;
  title: string;
  /**
   * A word on what's inside, shown in the collapsed header ("5 tools",
   * "10 positions · 2 vacant"). Collapsed sections are the whole page on a
   * phone, so this is what makes the list scannable without opening anything.
   */
  meta?: ReactNode;
  /** Header-level link or button, e.g. "Manage positions". */
  action?: ReactNode;
  /**
   * Set false to pin the section open and drop the toggle entirely — for when
   * something outside has already narrowed the page, like an active search.
   * A section hidden behind a chevron while the user is searching for what's
   * inside it reads as "no results".
   */
  collapsible?: boolean;
  /** Opened by default on mobile. Off unless a section really is the point of the page. */
  defaultExpanded?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id,
  title,
  meta,
  action,
  collapsible = true,
  defaultExpanded = false,
  children,
  className = "",
}: CollapsibleSectionProps) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);

  // After mount, because localStorage doesn't exist on the server. Starting
  // from `defaultExpanded` in both places keeps the first render identical.
  useEffect(() => {
    const remembered = readSectionExpanded(id);
    if (remembered !== undefined) setExpanded(remembered);
  }, [id]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    // Written on toggle only, so an untouched section keeps no entry.
    writeSectionExpanded(id, next);
  }

  if (!collapsible) {
    return (
      <div className={className}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {action}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Mobile: the header is the control. Full width so it's an easy target. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="mb-4 flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left md:hidden"
      >
        <span className="min-w-0">
          <span className="block text-lg font-semibold">{title}</span>
          {meta && (
            <span className="block text-xs text-muted-foreground">{meta}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Desktop: unchanged from before this section could collapse. */}
      <div className="mb-4 hidden flex-wrap items-center justify-between gap-2 md:flex">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>

      <div id={contentId} className={expanded ? undefined : "hidden md:block"}>
        {/* The header action lives in the panel on mobile — you can't act on a
            section you haven't opened, and it would crowd the tap target. */}
        {action && (
          <div className="mb-3 flex justify-end md:hidden">{action}</div>
        )}
        {children}
      </div>
    </div>
  );
}
