"use client";

import { useEffect, useRef, useState } from "react";
import { searchVolunteers } from "@/actions/volunteer-hours";
import type { VolunteerCandidate } from "@/lib/volunteer-hours-entry";
import { cn } from "@/lib/utils";

/**
 * "Whose hours are these?" — the one field on the form that isn't a text box.
 *
 * Typing searches the school as you go, because the answer is usually somebody
 * already here and matching them is what puts the entry on their own page. But
 * the search is a suggestion, never a gate: the sheet from the PTA meeting has
 * names on it that DragonHub has never heard of, and the whole point is that
 * those get typed in too.
 */

export interface PickedVolunteer {
  userId: string | null;
  name: string;
  email: string;
}

interface Props {
  value: PickedVolunteer;
  onChange: (value: PickedVolunteer) => void;
  /** Cleared between entries, so the picker can drop its suggestion list too. */
  resetKey: number;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function VolunteerPicker({ value, onChange, resetKey }: Props) {
  const [matches, setMatches] = useState<VolunteerCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Every keystroke starts a search; only the newest one may write the results.
  const requestRef = useRef(0);

  useEffect(() => {
    setMatches([]);
    setDismissed(false);
  }, [resetKey]);

  useEffect(() => {
    // A picked account is settled — searching on the name we just filled in
    // would reopen the list under the cursor.
    if (value.userId || dismissed) return;
    const term = value.name.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }

    const request = ++requestRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchVolunteers(term);
        if (requestRef.current === request) setMatches(found);
      } catch {
        if (requestRef.current === request) setMatches([]);
      } finally {
        if (requestRef.current === request) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value.name, value.userId, dismissed]);

  function pick(candidate: VolunteerCandidate) {
    onChange({
      userId: candidate.userId,
      name: candidate.name,
      email: candidate.email ?? "",
    });
    setMatches([]);
    setDismissed(true);
  }

  const isNewPerson = !value.userId && value.name.trim().length > 0;

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-sm font-medium">Volunteer</label>
        <div className="relative">
          <input
            value={value.name}
            onChange={(event) => {
              setDismissed(false);
              // Typing over a matched person un-matches them: the name in the
              // box and the account the entry lands on must never disagree.
              onChange({ userId: null, name: event.target.value, email: value.userId ? "" : value.email });
            }}
            placeholder="Start typing a name"
            autoComplete="off"
            className={inputClass}
          />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
              {matches.map((candidate) => (
                <li key={`${candidate.kind}:${candidate.userId ?? candidate.email ?? candidate.name}`}>
                  <button
                    type="button"
                    onClick={() => pick(candidate)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="text-sm font-medium">{candidate.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {candidate.email ??
                        "Recorded before — no email on file"}
                      {candidate.kind === "guest" && candidate.email
                        ? " · hasn't signed in yet"
                        : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {searching && matches.length === 0 && value.name.trim().length >= 2 && (
          <p className="mt-1 text-xs text-muted-foreground">Searching…</p>
        )}
      </div>

      {value.userId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{value.name}</span>
          {value.email && (
            <span className="text-muted-foreground">{value.email}</span>
          )}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            Already in DragonHub
          </span>
          <button
            type="button"
            onClick={() => onChange({ userId: null, name: "", email: "" })}
            className="ml-auto text-xs text-primary hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium">
            Email <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            type="email"
            value={value.email}
            onChange={(event) =>
              onChange({ ...value, email: event.target.value })
            }
            placeholder="jane@example.com"
            autoComplete="off"
            className={inputClass}
          />
          {isNewPerson && (
            <p
              className={cn(
                "mt-1 text-xs",
                value.email.trim()
                  ? "text-muted-foreground"
                  : "text-amber-700 dark:text-amber-500"
              )}
            >
              {value.email.trim()
                ? "We'll email them a sign-in link. Their hours are waiting when they arrive."
                : "Their hours will be recorded, but without an email address they can't sign in to DragonHub. You can add one later and they'll be linked automatically."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
