"use client";

import {
  positionLabel,
  type BoardPositionLabels,
} from "@/lib/board-positions-shared";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateYearPlans } from "@/actions/year-planning";
import type {
  YearPlanCandidate,
  PlanAssignment,
  BoardMemberLoad,
} from "@/actions/year-planning";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  BOARD_LEAD_TARGET,
  EVENT_CATEGORIES,
  monthLabel,
} from "@/lib/constants";
import { CalendarPlus, TriangleAlert, Users } from "lucide-react";
import { PlanAssignmentRow } from "./plan-assignment-row";

interface YearPlanSetupProps {
  schoolYear: string;
  /** slug -> label for this school, including retired positions. */
  positionLabels: BoardPositionLabels;
  candidates: YearPlanCandidate[];
  plans: PlanAssignment[];
  board: BoardMemberLoad[];
  members: { userId: string; name: string; email: string; isBoard: boolean }[];
}

export function YearPlanSetup({
  schoolYear,
  positionLabels,
  candidates,
  plans,
  board,
  members,
}: YearPlanSetupProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [generating, startGenerating] = useTransition();

  const unplanned = candidates.filter((c) => !c.existingPlanId);
  // Pre-checked: opening the year's whole slate is the reason anyone is here,
  // so the default selection is "all of the ones that don't exist yet".
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(unplanned.map((c) => c.catalogId))
  );
  const unassigned = plans.filter((p) => !p.boardLead).length;

  function toggle(catalogId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(catalogId)) next.delete(catalogId);
      else next.add(catalogId);
      return next;
    });
  }

  function handleGenerate() {
    startGenerating(async () => {
      try {
        const result = await generateYearPlans({
          schoolYear,
          catalogIds: [...selected],
        });
        addToast(
          `Created ${result.created} event ${
            result.created === 1 ? "plan" : "plans"
          }${
            result.skipped > 0
              ? ` — ${result.skipped} already had a ${schoolYear} plan`
              : ". Assign leads next so every event has an owner."
          }`,
          "success"
        );
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error
            ? error.message
            : "Couldn't generate plans. Something went wrong.",
          "destructive"
        );
      }
    });
  }

  return (
    <Tabs defaultValue={unplanned.length > 0 ? "generate" : "assign"}>
      <TabsList>
        <TabsTrigger value="generate">
          Generate Plans
          {unplanned.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {unplanned.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="assign">
          Assign Leads
          {unassigned > 0 && (
            <Badge variant="secondary" className="ml-2">
              {unassigned}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {/* ─── Generate ────────────────────────────────────────────────── */}
      <TabsContent value="generate" className="space-y-4">
        {candidates.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="No recurring events yet"
            description="Add the events your PTA runs every year, then come back to open this year's plans in one pass."
          >
            <Link href="/admin/board/event-catalog">
              <Button>Set up recurring events</Button>
            </Link>
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  {unplanned.length === 0
                    ? `Every recurring event already has a ${schoolYear} plan.`
                    : `${selected.size} of ${unplanned.length} events selected for ${schoolYear}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Each becomes a draft plan named
                  {" “"}Event name ({schoolYear}){"”"}, prefilled from
                  its recurring event.
                </p>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || selected.size === 0}
              >
                <CalendarPlus className="h-4 w-4" />
                {generating
                  ? "Generating…"
                  : `Generate ${selected.size} ${
                      selected.size === 1 ? "plan" : "plans"
                    }`}
              </Button>
            </div>

            <div className="space-y-2">
              {candidates.map((c) => {
                const done = Boolean(c.existingPlanId);
                return (
                  <label
                    key={c.catalogId}
                    className={`flex items-start gap-3 rounded-lg border border-border bg-card p-4 ${
                      done ? "opacity-60" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={!done && selected.has(c.catalogId)}
                      disabled={done}
                      onChange={() => toggle(c.catalogId)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{c.title}</p>
                        {c.category && (
                          <Badge variant="secondary">
                            {EVENT_CATEGORIES[
                              c.category as keyof typeof EVENT_CATEGORIES
                            ] ?? c.category}
                          </Badge>
                        )}
                        {c.typicalMonth && (
                          <span className="text-xs text-muted-foreground">
                            usually {monthLabel(c.typicalMonth)}
                            {c.timingNote ? ` — ${c.timingNote}` : ""}
                          </span>
                        )}
                      </div>

                      {done ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Already planned:{" "}
                          <Link
                            href={`/events/${c.existingPlanId}`}
                            className="underline hover:text-foreground"
                          >
                            {c.existingPlanTitle}
                          </Link>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Will create {c.planTitle}
                        </p>
                      )}

                      {/* Not a blocker — a plan with gaps still beats no plan.
                          Saying which gaps, and where to fill them once for
                          every future year, is the useful part. */}
                      {!done && c.missingDefaults.length > 0 && (
                        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          No default {c.missingDefaults.join(", ").toLowerCase()}
                          {" — "}
                          <Link
                            href="/admin/board/event-catalog"
                            className="underline hover:text-foreground"
                          >
                            set them once
                          </Link>{" "}
                          and every year inherits them.
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </TabsContent>

      {/* ─── Assign ──────────────────────────────────────────────────── */}
      <TabsContent value="assign" className="space-y-4">
        {plans.length === 0 ? (
          <EmptyState
            icon={Users}
            title={`No ${schoolYear} event plans yet`}
            description="Generate this year's plans first, then come back to divide them up."
          />
        ) : (
          <>
            {/* The board's whole load at a glance. Assigning one event at a
                time hides the thing that actually matters — whether the work
                is spread evenly. */}
            {board.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">
                  Board workload for {schoolYear}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Each board member is expected to lead {BOARD_LEAD_TARGET.min}
                  –{BOARD_LEAD_TARGET.max} events.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {board.map((m) => {
                    const short = m.eventCount < BOARD_LEAD_TARGET.min;
                    const over = m.eventCount > BOARD_LEAD_TARGET.max;
                    return (
                      <div
                        key={m.userId}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                          short || over
                            ? "border-amber-500/40 bg-amber-500/10"
                            : "border-border bg-muted"
                        }`}
                        title={
                          m.boardPosition
                            ? positionLabel(positionLabels, m.boardPosition)
                            : undefined
                        }
                      >
                        <span className="font-medium">{m.name}</span>
                        <span className="text-muted-foreground">
                          {m.eventCount}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {plans.map((plan) => (
                <PlanAssignmentRow
                  key={plan.planId}
                  plan={plan}
                  board={board}
                  members={members}
                />
              ))}
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
