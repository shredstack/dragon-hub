"use client";

import { useCallback, useEffect, useState } from "react";
import type { LeaderboardPayload } from "@/actions/scavenger-hunts";

const POLL_MS = 5000;

/**
 * The live board, polled rather than pushed.
 *
 * The app has no websocket or SSE infrastructure, and standing one up for one
 * evening isn't worth it: two indexed queries every five seconds across a few
 * hundred phones is comfortably inside Neon's headroom. Polling pauses while
 * the tab is hidden so a phone in a pocket stops asking.
 */
export function Leaderboard({ code }: { code: string }) {
  const [board, setBoard] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState(false);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/hunt/${code}/leaderboard`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Leaderboard responded ${res.status}`);
      setBoard(await res.json());
      setError(false);
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
      setError(true);
    }
  }, [code]);

  useEffect(() => {
    fetchBoard();

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(fetchBoard, POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        // Catch up immediately on return — a board that's five seconds stale
        // the moment you look at it feels broken.
        fetchBoard();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchBoard]);

  if (!board) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {error ? "Couldn't load the leaderboard." : "Loading the leaderboard…"}
      </div>
    );
  }

  const youOnPodium =
    board.finishers.some((f) => f.isYou) || board.inProgress.some((p) => p.isYou);

  return (
    <div className="space-y-6">
      <p className="text-center text-sm text-muted-foreground">
        {board.participantCount} playing · updates every few seconds
      </p>

      <section>
        <h2 className="mb-2 font-semibold">🏆 First to Finish</h2>
        {board.finishers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nobody has finished yet — this could be you.
          </p>
        ) : (
          <ul className="space-y-2">
            {board.finishers.map((f) => (
              <li
                key={`${f.handle}-${f.rank}`}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  f.isYou
                    ? "border-dragon-blue-500 bg-dragon-blue-50 ring-2 ring-dragon-blue-300"
                    : "border-border bg-card"
                }`}
              >
                <span className="w-6 shrink-0 text-center font-bold text-muted-foreground">
                  {f.rank}
                </span>
                <span className="text-2xl">{f.emoji}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {f.handle}
                  {f.isYou && (
                    <span className="ml-2 text-xs font-normal text-dragon-blue-600">
                      you
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  done
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">🔥 Hot on the Trail</h2>
        {board.inProgress.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No one is mid-hunt right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {board.inProgress.map((p) => (
              <li
                key={p.handle}
                className={`flex items-center gap-3 rounded-xl border p-3 ${
                  p.isYou
                    ? "border-dragon-blue-500 bg-dragon-blue-50 ring-2 ring-dragon-blue-300"
                    : "border-border bg-card"
                }`}
              >
                <span className="text-2xl">{p.emoji}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.handle}
                  {p.isYou && (
                    <span className="ml-2 text-xs font-normal text-dragon-blue-600">
                      you
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {p.completed} / {board.totalItems}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Everyone gets a personal stat, even well off the podium. */}
      {board.you && !youOnPodium && (
        <section>
          <h2 className="mb-2 font-semibold">You</h2>
          <div className="flex items-center gap-3 rounded-xl border border-dragon-blue-500 bg-dragon-blue-50 p-3 ring-2 ring-dragon-blue-300">
            <span className="text-2xl">{board.you.emoji}</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {board.you.handle}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {board.you.finishedAt
                ? `finished #${board.you.rank}`
                : `${board.you.completed} / ${board.totalItems}`}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
