"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { EmojiEntry, EmojiGroup } from "@/lib/emoji-data";

/**
 * The full emoji keyboard: search across every emoji Unicode names, or scroll a
 * category the way a phone's picker does.
 *
 * It exists because a twenty-emoji palette answers "give me something festive"
 * and nothing else — a room that wants a narwhal had to go find the system
 * keyboard. `EmojiPicker` keeps the palette as the fast path and opens this
 * underneath it.
 *
 * The 1,861-entry list is ~130KB of source, so it is **lazily imported** on
 * first open rather than statically. Every surface that stores an emoji renders
 * `EmojiPicker`, and none of them should pay for a list nobody opened.
 */

interface EmojiBrowserProps {
  onSelect: (emoji: string) => void;
  /** Highlighted in the grid, so re-opening shows what's already chosen. */
  selected?: string;
}

export function EmojiBrowser({ onSelect, selected }: EmojiBrowserProps) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const searchRef = useRef<((q: string) => EmojiEntry[]) | null>(null);
  // Scrolls back to the top when the shown set changes — otherwise a search
  // typed while scrolled halfway down Objects looks like it returned nothing.
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/lib/emoji-data")
      .then((module) => {
        if (cancelled) return;
        searchRef.current = module.searchEmoji;
        setGroups(module.EMOJI_GROUPS);
        setActiveKey(module.EMOJI_GROUPS[0]?.key ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedQuery = query.trim();

  const shown = useMemo(() => {
    if (!groups) return [];
    if (trimmedQuery) return searchRef.current?.(trimmedQuery) ?? [];
    return groups.find((group) => group.key === activeKey)?.emoji ?? [];
  }, [groups, trimmedQuery, activeKey]);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
  }, [trimmedQuery, activeKey]);

  if (failed) {
    return (
      <div className="border-border bg-muted/30 mt-2 rounded-lg border p-4 text-sm">
        <p className="text-muted-foreground">
          The emoji list didn&apos;t load. Pick from the palette above, or paste
          one from your keyboard.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border bg-card mt-2 rounded-lg border">
      <div className="border-border border-b p-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji — cake, dragon, soccer…"
            className="pr-8 pl-8"
            // The browser only exists because someone asked for it, so the
            // cursor starts where they're going to type.
            autoFocus
            aria-label="Search emoji"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs stay put while searching, greyed rather than hidden, so
          clearing the box lands the reader back where they were. */}
      {groups && (
        <div
          className="border-border flex gap-0.5 overflow-x-auto border-b p-1"
          role="tablist"
          aria-label="Emoji categories"
        >
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={!trimmedQuery && group.key === activeKey}
              title={group.label}
              onClick={() => {
                setQuery("");
                setActiveKey(group.key);
              }}
              className={`shrink-0 rounded px-2 py-1 text-lg transition-colors ${
                !trimmedQuery && group.key === activeKey
                  ? "bg-muted"
                  : "hover:bg-muted/60 opacity-60"
              }`}
            >
              <span aria-hidden="true">{group.tab}</span>
              <span className="sr-only">{group.label}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={gridRef}
        className="max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain p-2"
      >
        {!groups ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading emoji…
          </div>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No emoji match &ldquo;{trimmedQuery}&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-10">
            {shown.map((entry) => (
              <button
                key={entry.char}
                type="button"
                onClick={() => onSelect(entry.char)}
                title={entry.name}
                aria-label={entry.name}
                aria-pressed={entry.char === selected}
                className={`hover:bg-muted flex aspect-square items-center justify-center rounded text-xl transition-colors ${
                  entry.char === selected ? "bg-muted ring-ring ring-2" : ""
                }`}
              >
                {entry.char}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
