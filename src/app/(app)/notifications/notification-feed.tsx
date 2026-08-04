"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2 } from "lucide-react";
import {
  getNotifications,
  markAllRead,
  markRead,
  type NotificationRow,
} from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TYPES } from "@/lib/constants";

const PAGE_SIZE = 20;

/**
 * The full inbox. Cards rather than the card-on-mobile table split — this is a
 * feed, and a feed reads the same on both, so there is nothing to switch
 * between.
 */
export function NotificationFeed({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [done, setDone] = useState(initial.length < PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const hasUnread = rows.some((r) => !r.readAt);

  async function loadMore() {
    const oldest = rows[rows.length - 1]?.createdAt;
    if (!oldest) return;
    setLoading(true);
    try {
      const next = await getNotifications({
        limit: PAGE_SIZE,
        before: new Date(oldest),
      });
      setRows((r) => [...r, ...next]);
      if (next.length < PAGE_SIZE) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  function open(row: NotificationRow) {
    if (!row.readAt) {
      setRows((r) =>
        r.map((x) => (x.id === row.id ? { ...x, readAt: new Date() } : x))
      );
      startTransition(() => {
        void markRead(row.id);
      });
    }
    if (row.url) router.push(row.url);
  }

  async function handleMarkAll() {
    setRows((r) => r.map((x) => ({ ...x, readAt: x.readAt ?? new Date() })));
    await markAllRead();
    window.dispatchEvent(new CustomEvent("dragonhub:notifications-seen"));
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">No notifications yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          When someone posts on a board you&apos;re on, assigns you a task, or a
          spot opens up, it&apos;ll show up here.
        </p>
      </div>
    );
  }

  const groups = groupByDay(rows);

  return (
    <div className="space-y-6">
      {hasUnread && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            <Check className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        </div>
      )}

      {groups.map(({ label, items }) => (
        <section key={label}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </h2>
          <div className="space-y-2">
            {items.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => open(row)}
                className={cn(
                  "flex w-full gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50",
                  // A left accent bar rather than a background tint: it stays
                  // legible when several unread rows sit next to each other.
                  !row.readAt && "border-l-4 border-l-primary"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      row.readAt ? "font-medium" : "font-semibold"
                    )}
                  >
                    {row.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {row.body}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{typeLabel(row.type)}</span>
                    <span aria-hidden>·</span>
                    <span>{formatTime(row.createdAt)}</span>
                    {row.collapsedCount > 1 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{row.collapsedCount} updates</span>
                      </>
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {!done && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load older
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Falls back to the raw slug rather than rendering blank, on the same bargain
 * `categoryLabel()` makes: a row filed under a type that has since been
 * removed stays readable.
 */
function typeLabel(type: string): string {
  return (
    (NOTIFICATION_TYPES as Record<string, { label: string } | undefined>)[type]
      ?.label ?? type
  );
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupByDay(
  rows: NotificationRow[]
): Array<{ label: string; items: NotificationRow[] }> {
  const out: Array<{ label: string; items: NotificationRow[] }> = [];
  for (const row of rows) {
    const label = dayLabel(new Date(row.createdAt));
    const last = out[out.length - 1];
    if (last?.label === label) last.items.push(row);
    else out.push({ label, items: [row] });
  }
  return out;
}

function dayLabel(date: Date): string {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
