"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  audienceNeedsCommittee,
  audienceProblems,
  MAILING_COVERAGE_FILTERS,
  MAILING_COVERAGE_FILTER_HINTS,
  MAILING_GROUPINGS,
  MAILING_GROUPING_HINTS,
  MAILING_RECIPIENT_ROLES,
  MAILING_RECIPIENT_ROLE_HINTS,
  type MailingAudience,
  type MailingCoverageFilter,
  type MailingGrouping,
  type MailingRecipientRole,
} from "@/lib/mail-merge-shared";
import type { AudienceOptions } from "./mailing-editor";

/**
 * Who a mailing goes to, in three questions: how to split it, who inside each
 * group, and which classrooms count at all.
 *
 * Building is deliberately an explicit button rather than something that
 * happens as the form changes. The result is a list someone works down over
 * days, with sent marks on it — regenerating that as a side effect of ticking a
 * checkbox would be alarming.
 */
export function AudienceForm({
  audience,
  options,
  pending,
  groupCount,
  sentCount,
  onBuild,
}: {
  audience: MailingAudience;
  options: AudienceOptions;
  pending: boolean;
  groupCount: number;
  sentCount: number;
  onBuild: (audience: MailingAudience) => void;
}) {
  const [draft, setDraft] = useState<MailingAudience>(audience);

  const set = (patch: Partial<MailingAudience>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const toggleRole = (role: MailingRecipientRole) =>
    setDraft((d) => ({
      ...d,
      recipientRoles: d.recipientRoles.includes(role)
        ? d.recipientRoles.filter((r) => r !== role)
        : [...d.recipientRoles, role],
    }));

  const problems = audienceProblems(draft);
  const needsCommittee = audienceNeedsCommittee(draft);
  const hasDliRooms = options.classrooms.some((c) => c.isDli);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Label>How should it be split?</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            Object.entries(MAILING_GROUPINGS) as [MailingGrouping, string][]
          ).map(([value, label]) => {
            // The two DLI options are noise at a school that doesn't run DLI.
            if (
              (value === "dli_grade" || value === "dli_split") &&
              !hasDliRooms
            ) {
              return null;
            }
            const active = draft.grouping === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => set({ grouping: value })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-dragon-blue-500 bg-dragon-blue-500/5"
                    : "border-border hover:border-dragon-blue-500/50"
                }`}
              >
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {MAILING_GROUPING_HINTS[value]}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <Label>Who in each group?</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            Object.entries(MAILING_RECIPIENT_ROLES) as [
              MailingRecipientRole,
              string,
            ][]
          ).map(([value, label]) => {
            const active = draft.recipientRoles.includes(value);
            return (
              <label
                key={value}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  active
                    ? "border-dragon-blue-500 bg-dragon-blue-500/5"
                    : "border-border hover:border-dragon-blue-500/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleRole(value)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {MAILING_RECIPIENT_ROLE_HINTS[value]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <Label>Which classrooms?</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            Object.entries(MAILING_COVERAGE_FILTERS) as [
              MailingCoverageFilter,
              string,
            ][]
          ).map(([value, label]) => {
            const active = draft.coverage === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => set({ coverage: value })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-dragon-blue-500 bg-dragon-blue-500/5"
                    : "border-border hover:border-dragon-blue-500/50"
                }`}
              >
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {MAILING_COVERAGE_FILTER_HINTS[value]}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Coverage is read fresh every time you build, so &ldquo;rooms still
          short&rdquo; means short right now — not when you started writing.
        </p>
      </section>

      {needsCommittee && (
        <section className="space-y-2">
          <Label htmlFor="mailing-committee">Which committee?</Label>
          <select
            id="mailing-committee"
            value={draft.committeeId ?? ""}
            onChange={(e) => set({ committeeId: e.target.value || null })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-sm"
          >
            <option value="">Choose a committee…</option>
            {options.committees.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.perClassroomLimit
                  ? ` — ${c.perClassroomLimit} per classroom`
                  : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            A committee with no per-classroom limit has no per-room coverage to
            measure, so &ldquo;short on committee coverage&rdquo; will match
            nothing for it.
          </p>
        </section>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {groupCount > 0 && sentCount > 0 && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Rebuilding keeps the {sentCount} group
          {sentCount === 1 ? "" : "s"} you&apos;ve already marked sent, and any
          notes you wrote. A group that no longer matches is removed.
        </p>
      )}

      <Button
        onClick={() => onBuild(draft)}
        disabled={pending || problems.length > 0}
      >
        <RefreshCw className="h-4 w-4" />
        {groupCount > 0 ? "Rebuild the list" : "Build the list"}
      </Button>
    </div>
  );
}
