"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MinutesStatusBadge } from "@/components/minutes/minutes-status-badge";
import { ApproveButton } from "@/components/minutes/approve-button";
import { DeleteMinutesButton } from "@/components/minutes/delete-minutes-button";
import { ExpandableSummary } from "@/components/minutes/expandable-summary";
import {
  MINUTES_SORT_OPTIONS,
  sortMinutes,
  type MinutesSortKey,
} from "./minutes-sort";

/** The server's own order: most recently synced first. */
const ADDED = "added";

const PENDING_SORT_OPTIONS = {
  [ADDED]: "Recently added",
  ...MINUTES_SORT_OPTIONS,
} as const;

type PendingSortKey = MinutesSortKey | typeof ADDED;

interface PendingMinutes {
  id: string;
  fileName: string;
  documentType: "minutes" | "agenda";
  meetingDate: string | null;
  aiSummary: string | null;
  tags: string[] | null;
  status: "pending" | "approved";
  googleDriveUrl: string;
}

interface PendingMinutesTableProps {
  // Ordered most-recently-added first by the server.
  minutes: PendingMinutes[];
}

export function PendingMinutesTable({ minutes }: PendingMinutesTableProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<PendingSortKey>(ADDED);

  const filteredMinutes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return minutes;
    return minutes.filter((m) => {
      const haystack = [
        m.fileName,
        m.aiSummary ?? "",
        ...(m.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [minutes, search]);

  const sortedMinutes = useMemo(
    () =>
      sort === ADDED ? filteredMinutes : sortMinutes(filteredMinutes, sort),
    [filteredMinutes, sort]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pending minutes by name, summary, or tag…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          {search.trim() && (
            <p className="text-sm text-muted-foreground">
              Showing {sortedMinutes.length} of {minutes.length}
            </p>
          )}
          <label
            htmlFor="pending-sort"
            className="text-sm text-muted-foreground"
          >
            Sort:
          </label>
          <select
            id="pending-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as PendingSortKey)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {Object.entries(PENDING_SORT_OPTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="p-3">File Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Meeting Date</th>
                <th className="p-3">Summary</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedMinutes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No pending minutes match your search.
                  </td>
                </tr>
              ) : (
                sortedMinutes.map((m) => (
                  <tr key={m.id} className="border-b border-border">
                    <td className="p-3">
                      <Link
                        href={`/minutes/${m.id}`}
                        className="font-medium hover:underline"
                      >
                        {m.fileName}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          m.documentType === "agenda" ? "secondary" : "outline"
                        }
                      >
                        {m.documentType === "agenda" ? "Agenda" : "Minutes"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {m.meetingDate
                        ? new Date(m.meetingDate).toLocaleDateString()
                        : "Not set"}
                    </td>
                    <td className="max-w-xs p-3 text-sm">
                      <ExpandableSummary summary={m.aiSummary} />
                    </td>
                    <td className="p-3">
                      <MinutesStatusBadge status={m.status} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <ApproveButton minutesId={m.id} />
                        <a
                          href={m.googleDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View
                        </a>
                        <DeleteMinutesButton
                          minutesId={m.id}
                          fileName={m.fileName}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
