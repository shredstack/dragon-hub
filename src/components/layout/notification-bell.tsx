"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, Loader2 } from "lucide-react";
import {
  getNotifications,
  markAllRead,
  markRead,
  type NotificationRow,
} from "@/actions/notifications";
import { cn } from "@/lib/utils";

/**
 * The bell, its badge, and a dropdown of the ten most recent notifications.
 *
 * The unread count arrives two ways and both are needed. `initialUnreadCount`
 * is resolved on the server in `(app)/layout.tsx` so the badge is correct in
 * the first paint rather than popping in a moment later; after that a 60-second
 * poll of `/api/notifications/unread-count` keeps it fresh. The poll hits a
 * route handler rather than a server action deliberately — a server action
 * would re-render the whole page tree once a minute for one integer.
 */
export function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnreadCount);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      if (typeof data.count === "number") setUnread(data.count);
    } catch {
      // Offline, or the tab is being torn down. The next tick tries again.
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshCount, 60_000);
    // Coming back to a backgrounded tab is when the count is most likely to be
    // wrong and most likely to be looked at.
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Fired by CapacitorBridge when a push arrives with the app foregrounded.
    window.addEventListener("dragonhub:notification", refreshCount);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("dragonhub:notification", refreshCount);
    };
  }, [refreshCount]);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setBusy(true);
    try {
      setRows(await getNotifications({ limit: 10 }));
      // Opening the bell is the moment to clear the OS-level badge and any
      // notifications still sitting in the shade — the user has now seen them.
      window.dispatchEvent(new CustomEvent("dragonhub:notifications-seen"));
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenRow(row: NotificationRow) {
    setOpen(false);
    if (!row.readAt) {
      setUnread((n) => Math.max(0, n - 1));
      setRows((r) =>
        r?.map((x) => (x.id === row.id ? { ...x, readAt: new Date() } : x)) ??
        null
      );
      void markRead(row.id).catch(() => refreshCount());
    }
    if (row.url) router.push(row.url);
  }

  async function handleMarkAll() {
    setUnread(0);
    setRows((r) => r?.map((x) => ({ ...x, readAt: x.readAt ?? new Date() })) ?? null);
    try {
      await markAllRead();
      window.dispatchEvent(new CustomEvent("dragonhub:notifications-seen"));
    } catch {
      refreshCount();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-md p-2 hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Check className="h-3 w-3" />
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[60dvh] overflow-y-auto">
            {busy && rows === null ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : rows && rows.length > 0 ? (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => handleOpenRow(row)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted/60",
                        !row.readAt && "bg-primary/5"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {!row.readAt && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                        <span className="truncate text-sm font-medium">
                          {row.title}
                        </span>
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {row.body}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {relativeTime(row.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing yet. We&apos;ll let you know when something happens.
              </p>
            )}
          </div>

          <div className="border-t border-border px-4 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-primary hover:underline"
            >
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** "3m ago" / "Yesterday" — enough for a dropdown, no date library needed. */
export function relativeTime(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
