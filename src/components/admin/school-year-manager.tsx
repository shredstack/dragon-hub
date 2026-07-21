"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewRollover,
  rolloverSchoolYear,
  updateCurrentSchoolYear,
  addAvailableSchoolYear,
  removeAvailableSchoolYear,
} from "@/actions/school-year";
import { AlertTriangle, ArrowRight, Check, KeyRound, Users } from "lucide-react";

type RolloverPreview = Awaited<ReturnType<typeof previewRollover>>;

interface SchoolYearManagerProps {
  currentSchoolYear: string;
  previousSchoolYear: string;
  nextSchoolYear: string;
  currentJoinCode: string;
  availableYears: string[];
  awaitingRejoin: number;
  lockoutRisk: boolean;
}

const roleLabel: Record<string, string> = {
  admin: "School Admin",
  pta_board: "PTA Board",
  member: "Member",
};

export function SchoolYearManager({
  currentSchoolYear,
  nextSchoolYear,
  currentJoinCode,
  availableYears,
  awaitingRejoin,
  lockoutRisk,
}: SchoolYearManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [targetYear, setTargetYear] = useState(nextSchoolYear);
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [alsoCarry, setAlsoCarry] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const notify = (type: "success" | "error", text: string) =>
    setMessage({ type, text });

  async function run<T>(key: string, fn: () => Promise<T>, onOk: (r: T) => void) {
    setBusy(key);
    setMessage(null);
    try {
      onOk(await fn());
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setBusy(null);
    }
  }

  const handlePreview = () =>
    run("preview", () => previewRollover(targetYear), (result) => {
      setPreview(result);
      setJoinCode(result.suggestedJoinCode);
      setAlsoCarry(new Set());
      setConfirmText("");
    });

  const handleRollover = () => {
    if (!preview) return;
    run(
      "rollover",
      () =>
        rolloverSchoolYear({
          targetYear: preview.targetYear,
          newJoinCode: joinCode,
          alsoCarryOver: Array.from(alsoCarry),
        }),
      (result) => {
        setPreview(null);
        notify(
          "success",
          `Now running ${result.targetYear}. ${result.carriedOver} board member(s) carried over, ` +
            `${result.expired} member(s) must rejoin with code ${result.joinCode}.`
        );
        startTransition(() => router.refresh());
      }
    );
  };

  const toggleCarry = (id: string) => {
    const next = new Set(alsoCarry);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAlsoCarry(next);
  };

  const confirmPhrase = preview?.targetYear ?? "";
  const canConfirm = confirmText.trim() === confirmPhrase;

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {lockoutRisk && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm text-red-800">
            <p className="font-semibold">No board access for {currentSchoolYear}</p>
            <p className="mt-1">
              This school has no approved School Admin or PTA Board member for its
              active year. Assign one from{" "}
              <a href="/admin/members" className="underline">
                Members
              </a>{" "}
              before rolling over.
            </p>
          </div>
        </div>
      )}

      {/* ── Rollover wizard ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Start a new school year</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Carries your board forward, rotates the join code, and asks everyone else
          to rejoin — in one step. Nothing from past years is deleted.
        </p>

        {!preview ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">
                Roll over to
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-md border border-border bg-muted px-3 py-2 font-mono">
                  {currentSchoolYear}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <input
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                  placeholder="2026-2027"
                  className="w-36 rounded-md border border-input bg-background px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <button
              onClick={handlePreview}
              disabled={busy === "preview"}
              className="rounded-md bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
            >
              {busy === "preview" ? "Checking..." : "Preview changes"}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium">
                {preview.fromYear} → {preview.targetYear}
              </p>
            </div>

            {/* Keeps access */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                <Check className="h-4 w-4" />
                Keeps access automatically ({preview.carriedOver.length})
              </div>
              <div className="mt-2 space-y-1.5">
                {preview.carriedOver.length === 0 && (
                  <p className="text-sm text-red-600">
                    Nobody. Assign a School Admin or PTA Board member first — the
                    rollover will be blocked otherwise.
                  </p>
                )}
                {preview.carriedOver.map((m) => (
                  <div
                    key={m.membershipId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span>
                      {m.name}{" "}
                      <span className="text-muted-foreground">{m.email}</span>
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {roleLabel[m.role] ?? m.role}
                      {m.boardPosition ? ` · ${m.boardPosition.replace(/_/g, " ")}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Must rejoin */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                <Users className="h-4 w-4" />
                Must rejoin with the new code ({preview.mustRejoin.length})
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tick anyone you want to carry over without rejoining.
              </p>
              <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                {preview.mustRejoin.map((m) => (
                  <label
                    key={m.membershipId}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={alsoCarry.has(m.membershipId)}
                      onChange={() => toggleCarry(m.membershipId)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="flex-1">
                      {m.name}{" "}
                      <span className="text-muted-foreground">{m.email}</span>
                    </span>
                  </label>
                ))}
                {preview.mustRejoin.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No other active members.
                  </p>
                )}
              </div>
            </div>

            {/* Join code */}
            <div>
              <label className="mb-1 flex items-center gap-2 text-sm font-medium">
                <KeyRound className="h-4 w-4" />
                New join code for {preview.targetYear}
              </label>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-ring"
                maxLength={20}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Replaces <span className="font-mono">{preview.currentJoinCode}</span>.
                Share this with families for the new year.
              </p>
            </div>

            {/* Confirm */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                Type <span className="font-mono font-semibold">{confirmPhrase}</span>{" "}
                to confirm.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={confirmPhrase}
                  className="w-44 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleRollover}
                  disabled={!canConfirm || busy === "rollover" || isPending}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy === "rollover" ? "Rolling over..." : "Start new year"}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Current year info ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Current year</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Active year</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">
              {currentSchoolYear}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Join code</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">
              {currentJoinCode}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Awaiting rejoin</dt>
            <dd className="mt-1 text-lg font-semibold">{awaitingRejoin}</dd>
          </div>
        </dl>
      </div>

      {/* ── Year list (view past years) ───────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Available years</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Years offered in dropdowns across the app. Past years stay listed so you
          can still view their classrooms, budgets, minutes and event plans.
        </p>
        <div className="mt-4 space-y-2">
          {availableYears.map((year) => (
            <div
              key={year}
              className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <span className="font-mono text-sm">
                {year}
                {year === currentSchoolYear && (
                  <span className="ml-2 font-sans text-xs text-green-700">
                    active
                  </span>
                )}
              </span>
              <div className="flex gap-3">
                {year !== currentSchoolYear && (
                  <button
                    onClick={() =>
                      run(
                        `switch-${year}`,
                        () => updateCurrentSchoolYear(year),
                        () => {
                          notify("success", `Active year set to ${year}.`);
                          startTransition(() => router.refresh());
                        }
                      )
                    }
                    disabled={busy === `switch-${year}`}
                    className="text-sm text-dragon-blue-600 hover:underline disabled:opacity-40"
                    title="Correct the active year (only allowed if that year already has a board member)"
                  >
                    {busy === `switch-${year}` ? "..." : "Set active"}
                  </button>
                )}
                <button
                  onClick={() =>
                    run(
                      `remove-${year}`,
                      () => removeAvailableSchoolYear(year),
                      () => {
                        notify("success", `Removed ${year}.`);
                        startTransition(() => router.refresh());
                      }
                    )
                  }
                  disabled={year === currentSchoolYear || busy === `remove-${year}`}
                  className="text-sm text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {busy === `remove-${year}` ? "..." : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {!availableYears.includes(nextSchoolYear) && (
          <button
            onClick={() =>
              run(
                "addNext",
                () => addAvailableSchoolYear(nextSchoolYear),
                () => {
                  notify("success", `Added ${nextSchoolYear}.`);
                  startTransition(() => router.refresh());
                }
              )
            }
            disabled={busy === "addNext"}
            className="mt-3 w-full rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-dragon-blue-500 hover:text-dragon-blue-600 disabled:opacity-50"
          >
            {busy === "addNext" ? "Adding..." : `+ Add ${nextSchoolYear}`}
          </button>
        )}
      </div>
    </div>
  );
}
