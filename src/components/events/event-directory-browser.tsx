"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, LayoutGrid, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CategorySelect } from "@/components/ui/category-select";
import { EventDirectoryCard } from "@/components/events/event-directory-card";
import { EVENT_CATEGORIES, monthLabel } from "@/lib/constants";
import {
  matchesEventQuery,
  schoolYearMonthRank,
  type DirectoryEntry,
  type DirectoryView,
} from "@/lib/event-directory-shared";
import { cn } from "@/lib/utils";

/**
 * The two ways to read the window: down the year, or all at once.
 *
 * Timeline is the default because a parent's question is usually "what's
 * coming?", and it groups by month in *school-year* order — August first, not
 * January — with a final "Anytime" group so an event with no typical month
 * falls somewhere rather than vanishing.
 *
 * Filtering is client-side and deliberately: the whole directory is one page of
 * a few dozen rows, and a round trip per keystroke on a parent's cell
 * connection is worse than the search being approximate.
 */
export function EventDirectoryBrowser({
  entries,
  initialView,
  initialCategory,
  initialQuery,
  reactionsEnabled,
  customEmojiEnabled,
}: {
  entries: DirectoryEntry[];
  initialView: DirectoryView;
  initialCategory: string;
  initialQuery: string;
  reactionsEnabled: boolean;
  customEmojiEnabled: boolean;
}) {
  const [view, setView] = useState<DirectoryView>(initialView);
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);

  // The state lives in the URL so a board member can send "look at the
  // fundraisers" as a link — but written with `history.replaceState` rather
  // than `router.replace`, because the filtering is entirely client-side and a
  // server round trip per keystroke is the thing this design avoids.
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "timeline") params.set("view", view);
    if (category) params.set("category", category);
    if (query.trim()) params.set("q", query.trim());
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      search ? `${window.location.pathname}?${search}` : window.location.pathname
    );
  }, [view, category, query]);

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!category || e.category === category) && matchesEventQuery(e, query)
      ),
    [entries, category, query]
  );

  const months = useMemo(() => {
    const groups = new Map<number | null, DirectoryEntry[]>();
    for (const entry of filtered) {
      const key = entry.typicalMonth ?? null;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()].sort(
      ([a], [b]) => schoolYearMonthRank(a) - schoolYearMonthRank(b)
    );
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search our events"
            className="pl-9"
            aria-label="Search our events"
          />
        </div>
        <CategorySelect
          set={EVENT_CATEGORIES}
          placeholder="All categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="sm:w-48"
          aria-label="Filter by category"
        />
        <div className="border-border bg-card inline-flex shrink-0 rounded-md border p-0.5">
          <ViewButton
            active={view === "timeline"}
            onClick={() => setView("timeline")}
            icon={<CalendarRange className="h-4 w-4" />}
            label="Timeline"
          />
          <ViewButton
            active={view === "grid"}
            onClick={() => setView("grid")}
            icon={<LayoutGrid className="h-4 w-4" />}
            label="Grid"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Nothing matches that. Try a different word, or clear the category.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => (
            <EventDirectoryCard
              key={entry.id}
              entry={entry}
              reactionsEnabled={reactionsEnabled}
              customEmojiEnabled={customEmojiEnabled}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {months.map(([month, group]) => (
            <section key={month ?? "anytime"}>
              {/* Sticky so the month a parent is scrolling through stays named
                  on a phone, where the heading is off-screen within one card. */}
              <h2 className="bg-muted/30 supports-[backdrop-filter]:bg-muted/60 sticky top-0 z-10 -mx-1 px-1 py-1.5 text-sm font-semibold backdrop-blur">
                {monthLabel(month) ?? "Anytime"}
              </h2>
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((entry) => (
                  <EventDirectoryCard
                    key={entry.id}
                    entry={entry}
                    reactionsEnabled={reactionsEnabled}
                    customEmojiEnabled={customEmojiEnabled}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-dragon-blue-500 text-white"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
