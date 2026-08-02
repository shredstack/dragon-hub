"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  readSectionExpanded,
  writeSectionExpanded,
} from "@/lib/section-collapse";

/**
 * One grade's worth of classrooms, behind a disclosure header.
 *
 * Unlike `CollapsibleSection` in `components/ui`, this collapses at *every*
 * width — a school with 25 rooms is a long page on a laptop too, and the whole
 * point of grouping by grade is being able to shut the grades you don't teach.
 * That is the only reason this isn't a prop on the shared component: that one's
 * default state is pure CSS precisely so it never has to know the viewport, and
 * desktop collapsing needs real state.
 *
 * The three-state `expanded` keeps the server's HTML correct at both widths
 * anyway:
 * - `undefined` — untouched. Renders `hidden md:grid`: open on desktop, closed
 *   on a phone, decided by CSS so nothing shifts after hydration.
 * - `true` / `false` — the user's own choice, remembered across visits and
 *   applied at both widths.
 */
interface GradeSectionProps {
  /** Stable id this section's open state is remembered under. */
  id: string;
  /** Grade label, e.g. "Kindergarten". */
  title: string;
  /** Room count or similar, shown in the header so a closed grade still reads. */
  meta?: ReactNode;
  children: ReactNode;
}

export function GradeSection({ id, title, meta, children }: GradeSectionProps) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean | undefined>(undefined);
  // What `undefined` resolves to for assistive tech. The SSR guess is the
  // desktop one; the effect below corrects it without touching a class name,
  // so this never causes a visual shift.
  const [defaultOpen, setDefaultOpen] = useState(true);

  useEffect(() => {
    const remembered = readSectionExpanded(id);
    if (remembered !== undefined) {
      setExpanded(remembered);
    } else {
      setDefaultOpen(window.matchMedia("(min-width: 768px)").matches);
    }
  }, [id]);

  function toggle() {
    const next = !(expanded ?? defaultOpen);
    setExpanded(next);
    // Written on toggle only, so an untouched grade keeps no entry and a grade
    // added next year starts at its own default.
    writeSectionExpanded(id, next);
  }

  const isOpen = expanded ?? defaultOpen;

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 border-b border-border py-2 text-left transition-colors hover:text-dragon-blue-600"
      >
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            expanded === undefined
              ? "-rotate-90 md:rotate-0"
              : expanded
                ? "rotate-0"
                : "-rotate-90"
          }`}
        />
        <span className="text-sm font-semibold">{title}</span>
        {meta && (
          <span className="ml-auto text-xs text-muted-foreground">{meta}</span>
        )}
      </button>

      <div
        id={contentId}
        className={`gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3 ${
          expanded === undefined
            ? "hidden md:grid"
            : expanded
              ? "grid"
              : "hidden"
        }`}
      >
        {children}
      </div>
    </section>
  );
}
