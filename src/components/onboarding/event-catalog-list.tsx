"use client";

import { useState } from "react";
import { EventCatalogCard } from "./event-catalog-card";
import type { EventCatalogEntryWithInterest } from "@/types";
import { CalendarX } from "lucide-react";

interface EventCatalogListProps {
  initialCatalog: EventCatalogEntryWithInterest[];
}

export function EventCatalogList({ initialCatalog }: EventCatalogListProps) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [filter, setFilter] = useState<"all" | "interested">("all");

  const filteredCatalog =
    filter === "all"
      ? catalog
      : catalog.filter((entry) => entry.userInterest !== null);

  const handleInterestChange = (
    entryId: string,
    newInterest: EventCatalogEntryWithInterest["userInterest"]
  ) => {
    setCatalog((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              userInterest: newInterest,
              totalInterested: newInterest
                ? entry.userInterest
                  ? entry.totalInterested
                  : entry.totalInterested + 1
                : entry.totalInterested - 1,
            }
          : entry
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            filter === "all"
              ? "border-b-2 border-green-500 text-green-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All Events ({catalog.length})
        </button>
        <button
          onClick={() => setFilter("interested")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            filter === "interested"
              ? "border-b-2 border-green-500 text-green-500"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          My Interests (
          {catalog.filter((e) => e.userInterest !== null).length})
        </button>
      </div>

      {/* Event Grid */}
      {filteredCatalog.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <CalendarX className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">
            {filter === "interested"
              ? "You haven't expressed interest in any events yet."
              : "No events in the catalog yet."}
          </p>
          {filter === "interested" && (
            <button
              onClick={() => setFilter("all")}
              className="mt-2 text-sm text-green-500 hover:text-green-600"
            >
              Browse all events
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCatalog.map((entry) => (
            <EventCatalogCard
              key={entry.id}
              entry={entry}
              onInterestChange={(newInterest) =>
                handleInterestChange(entry.id, newInterest)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
