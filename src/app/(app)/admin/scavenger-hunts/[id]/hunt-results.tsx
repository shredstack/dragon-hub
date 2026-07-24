"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { exportHuntFinishers } from "@/actions/scavenger-hunts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Finisher {
  rank: number;
  handle: string;
  handleEmoji: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  claimedName: string | null;
  claimedEmail: string | null;
}

interface InProgress {
  handle: string;
  handleEmoji: string;
  completedCount: number;
  startedAt: Date | null;
  lastActiveAt: Date | null;
}

interface ItemResponse {
  handle: string;
  handleEmoji: string;
  answers: { prompt: string; answer: "yes" | "no" }[];
  answeredAt: Date | null;
}

interface ItemStat {
  id: string;
  title: string;
  emoji: string;
  completedBy: number;
  saveResponses: boolean;
  tally: { prompt: string; yes: number; no: number }[];
  responses: ItemResponse[];
}

interface Results {
  totalItems: number;
  playerCount: number;
  finisherCount: number;
  finishers: Finisher[];
  inProgress: InProgress[];
  items: ItemStat[];
}

function timeOnly(value: Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** How long they took, which is the tell for a podium worth double-checking. */
function elapsed(start: Date | null, end: Date | null) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  return `${minutes} min`;
}

export function HuntResults({
  huntId,
  results,
}: {
  huntId: string;
  results: Results;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleExport = async () => {
    const csv = await exportHuntFinishers(huntId);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scavenger-hunt-finishers.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyEmails = () => {
    const emails = results.finishers
      .map((f) => f.claimedEmail)
      .filter(Boolean)
      .join(", ");
    navigator.clipboard.writeText(emails);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const claimedCount = results.finishers.filter((f) => f.claimedEmail).length;

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Results</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep this open on a laptop at the prize table during the event.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            Refresh
          </Button>
          {claimedCount > 0 && (
            <Button size="sm" variant="outline" onClick={copyEmails}>
              {copied ? "Copied!" : "Copy Emails"}
            </Button>
          )}
          {results.finishers.length > 0 && (
            <Button size="sm" onClick={handleExport}>
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Players started", value: results.playerCount },
          { label: "Finished", value: results.finisherCount },
          { label: "Items on the board", value: results.totalItems },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Finishers ─── */}
      <h3 className="mb-3 mt-6 font-medium">🏆 Finishers</h3>
      {results.finishers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nobody has finished yet.
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {results.finishers.map((f) => (
              <div
                key={f.rank}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{f.rank} {f.handleEmoji} {f.handle}
                    </p>
                    {f.claimedName ? (
                      <p className="text-sm text-muted-foreground">
                        {f.claimedName} · {f.claimedEmail}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No contact claimed
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge variant="secondary">
                    Finished {timeOnly(f.finishedAt)}
                  </Badge>
                  <Badge variant="secondary">
                    Took {elapsed(f.startedAt, f.finishedAt)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">#</th>
                    <th className="p-3 font-medium">Handle</th>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Finished</th>
                    <th className="p-3 font-medium">Took</th>
                  </tr>
                </thead>
                <tbody>
                  {results.finishers.map((f) => (
                    <tr key={f.rank} className="border-b border-border last:border-0">
                      <td className="p-3 font-medium">{f.rank}</td>
                      <td className="p-3">
                        {f.handleEmoji} {f.handle}
                      </td>
                      <td className="p-3">
                        {f.claimedName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {f.claimedEmail ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3">{timeOnly(f.finishedAt)}</td>
                      <td className="p-3">{elapsed(f.startedAt, f.finishedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── Still playing ─── */}
      {results.inProgress.length > 0 && (
        <>
          <h3 className="mb-3 mt-6 font-medium">🔥 Still playing</h3>
          <div className="space-y-2">
            {results.inProgress.map((p) => (
              <div
                key={p.handle}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <span>
                  {p.handleEmoji} {p.handle}
                </span>
                <span className="text-muted-foreground">
                  {p.completedCount} of {results.totalItems} · last seen{" "}
                  {timeOnly(p.lastActiveAt)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Per-item stats ─── */}
      {results.items.length > 0 && (
        <>
          <h3 className="mb-1 mt-6 font-medium">Which items got found</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            A low number usually means the booth was hard to find, not that the
            item was unpopular.
          </p>
          <div className="space-y-2">
            {results.items.map((item) => {
              const pct =
                results.playerCount === 0
                  ? 0
                  : Math.round((item.completedBy / results.playerCount) * 100);
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <span className="w-8 shrink-0 text-center text-lg">
                    {item.emoji}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.title}
                  </span>
                  <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                    <div
                      className="h-full rounded-full bg-dragon-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm text-muted-foreground">
                    {item.completedBy} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Saved answers ─── */}
      {results.items.some((i) => i.saveResponses) && (
        <>
          <h3 className="mb-1 mt-6 font-medium">Saved answers</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Answers to question items, kept with each player&apos;s anonymous
            code name. No personal details are stored.
          </p>
          <div className="space-y-3">
            {results.items
              .filter((i) => i.saveResponses)
              .map((item) => (
                <ItemResponses key={item.id} item={item} />
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function ItemResponses({ item }: { item: ItemStat }) {
  return (
    <details className="rounded-lg border border-border">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-4 font-medium">
        <span className="text-lg">{item.emoji}</span>
        <span className="min-w-0 flex-1">{item.title}</span>
        <Badge variant="secondary">
          {item.responses.length} response
          {item.responses.length === 1 ? "" : "s"}
        </Badge>
      </summary>

      <div className="border-t border-border p-4">
        {item.responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No answers recorded yet.
          </p>
        ) : (
          <>
            {/* Per-question tally — the headline for a budget vote. */}
            <div className="space-y-3">
              {item.tally.map((t) => {
                const total = t.yes + t.no;
                const yesPct = total === 0 ? 0 : Math.round((t.yes / total) * 100);
                return (
                  <div key={t.prompt}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{t.prompt}</span>
                      <span className="text-muted-foreground">
                        {t.yes} yes · {t.no} no
                      </span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${yesPct}%` }}
                      />
                      <div
                        className="h-full bg-red-400"
                        style={{ width: `${100 - yesPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-participant answers. */}
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              {item.responses.map((r, index) => (
                <div
                  key={`${r.handle}-${index}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                >
                  <span className="font-medium">
                    {r.handleEmoji} {r.handle}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {r.answers.map((a, i) => (
                      <Badge
                        key={i}
                        variant="secondary"
                        className={
                          a.answer === "yes"
                            ? "border-green-300 bg-green-50 text-green-800"
                            : "border-red-300 bg-red-50 text-red-800"
                        }
                      >
                        {a.prompt}: {a.answer === "yes" ? "Yes" : "No"}
                      </Badge>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
