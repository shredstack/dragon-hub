"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, ImageIcon } from "lucide-react";
import {
  FEEDBACK_STATUSES,
  feedbackStatusClasses,
  feedbackStatusLabel,
  feedbackTypeClasses,
  feedbackTypeLabel,
} from "@/lib/feedback-shared";
import type { FeedbackStatus, FeedbackType } from "@/actions/feedback";

export interface FeedbackRow {
  id: string;
  type: FeedbackType;
  status: FeedbackStatus;
  body: string;
  pageUrl: string;
  createdAt: string;
  submitterName: string | null;
  submitterEmail: string | null;
  schoolName: string | null;
  messageCount: number;
  hasScreenshot: boolean;
}

type StatusFilter = "all" | FeedbackStatus;
type TypeFilter = "all" | FeedbackType;

function StatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${feedbackStatusClasses(
        status
      )}`}
    >
      {feedbackStatusLabel(status)}
    </span>
  );
}

function TypeBadge({ type }: { type: FeedbackType }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${feedbackTypeClasses(
        type
      )}`}
    >
      {feedbackTypeLabel(type)}
    </span>
  );
}

export function FeedbackList({ items }: { items: FeedbackRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const it of items) byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
    return byStatus;
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          (statusFilter === "all" || it.status === statusFilter) &&
          (typeFilter === "all" || it.type === typeFilter)
      ),
    [items, statusFilter, typeFilter]
  );

  const submitter = (it: FeedbackRow) =>
    it.submitterName || it.submitterEmail || "Unknown";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="all">All statuses ({items.length})</option>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {feedbackStatusLabel(s)} ({counts[s] ?? 0})
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="all">All types</option>
          <option value="bug">Bugs</option>
          <option value="improvement">Improvements</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No feedback matches these filters.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((it) => (
              <Link
                key={it.id}
                href={`/super-admin/feedback/${it.id}`}
                className="block rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={it.type} />
                  <StatusBadge status={it.status} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(it.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm">{it.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{submitter(it)}</span>
                  {it.schoolName && <span>· {it.schoolName}</span>}
                  {it.messageCount > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {it.messageCount}
                    </span>
                  )}
                  {it.hasScreenshot && <ImageIcon className="h-3 w-3" />}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Feedback</th>
                    <th className="px-4 py-3 font-medium">Submitter</th>
                    <th className="px-4 py-3 font-medium">School</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 align-top">
                        <TypeBadge type={it.type} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/super-admin/feedback/${it.id}`}
                          className="block max-w-md"
                        >
                          <span className="line-clamp-2 hover:underline">
                            {it.body}
                          </span>
                          <span className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            {it.messageCount > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <MessageCircle className="h-3 w-3" />
                                {it.messageCount}
                              </span>
                            )}
                            {it.hasScreenshot && (
                              <span className="inline-flex items-center gap-1">
                                <ImageIcon className="h-3 w-3" />
                                screenshot
                              </span>
                            )}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {submitter(it)}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {it.schoolName ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge status={it.status} />
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {new Date(it.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
