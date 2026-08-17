"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  promoteConfirmCopy,
  promoteOverCapacityCopy,
  removeFromWaitlistCopy,
  WAITLIST_ADMIN_BLURB,
} from "@/lib/waitlist-shared";

/**
 * The board's view of a waitlist, for every feature that has one.
 *
 * Two presentations, one behaviour: `WaitlistPanel` is the list that sits
 * inside an expanded row (a classroom, a per-classroom committee room), and
 * `WaitlistTable` is the standalone table for a whole school-wide committee.
 * Both go through `useWaitlistActions`, so the confirmation wording, the
 * "promotion is automatic" explanation, the toast on a full room, and the
 * refresh afterwards are written once.
 *
 * The promote/remove server actions are passed in, because they are the one
 * genuinely per-feature thing here.
 */

export interface WaitlistPerson {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** 1-based place in line. */
  position: number;
  notes?: string | null;
  /** Feature-specific chips — "⭐ Would chair", "Hasn't signed in yet". */
  badges?: ReactNode;
}

interface WaitlistActions {
  /**
   * Give this person a spot. Returning `{ promoted: 0 }` means the seat wasn't
   * there — the group is full, a limit was lowered, or someone else took it.
   *
   * That is a question rather than a failure: the panel follows it with the
   * over-capacity confirmation and, if the board says yes, calls this again with
   * `overCapacity`. An implementation that can't seat past its limit should
   * simply keep returning `{ promoted: 0 }`, and the second toast reports it.
   */
  onPromote: (
    person: WaitlistPerson,
    options: { overCapacity: boolean }
  ) => Promise<{ promoted: number } | void>;
  onRemove: (person: WaitlistPerson) => Promise<void>;
  /** "Room 12", "the Yearbook Committee" — used in the confirmations. */
  where?: string;
  /** Seats filled and the cap, so the override can name the resulting count. */
  taken?: number;
  limit?: number | null;
}

function useWaitlistActions({
  onPromote,
  onRemove,
  where,
  taken,
  limit,
}: WaitlistActions) {
  const router = useRouter();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const { addToast } = useToast();

  const seated = (person: WaitlistPerson, overCapacity: boolean) => {
    addToast(
      overCapacity
        ? `${person.name} is in${where ? ` — ${where}` : ""}, above the limit.`
        : `${person.name} is in${where ? ` — ${where}` : ""}.`,
      "success"
    );
    router.refresh();
  };

  const promote = async (person: WaitlistPerson) => {
    const ok = await confirm({
      ...promoteConfirmCopy({
        name: person.name,
        position: person.position,
        where,
      }),
      confirmLabel: "Promote",
    });
    if (!ok) return;

    try {
      const result = await onPromote(person, { overCapacity: false });
      if (!result || result.promoted > 0) {
        seated(person, false);
        return;
      }

      // No seat. Rather than telling the board to go remove someone, offer the
      // thing they almost always want: more help in a room that has it on offer.
      closeConfirm();
      const override = await confirm({
        ...promoteOverCapacityCopy({ name: person.name, where, taken, limit }),
        confirmLabel: "Add anyway",
      });
      if (!override) return;

      const forced = await onPromote(person, { overCapacity: true });
      if (forced && forced.promoted === 0) {
        addToast(
          `Couldn't give ${person.name} a spot${where ? ` in ${where}` : ""}.`,
          "destructive"
        );
        router.refresh();
        return;
      }
      seated(person, true);
    } catch {
      addToast("Couldn't promote them. Please try again.", "destructive");
    } finally {
      closeConfirm();
    }
  };

  const remove = async (person: WaitlistPerson) => {
    const ok = await confirm({
      ...removeFromWaitlistCopy(person.name),
      confirmLabel: "Remove",
      tone: "destructive",
    });
    if (!ok) return;

    try {
      await onRemove(person);
      addToast(`${person.name} removed from the waitlist.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't remove them.", "destructive");
    } finally {
      closeConfirm();
    }
  };

  return { promote, remove, confirmDialog };
}

/** The buttons every waitlist row carries, in every presentation. */
function WaitlistRowActions({
  person,
  promote,
  remove,
}: {
  person: WaitlistPerson;
  promote: (person: WaitlistPerson) => void;
  remove: (person: WaitlistPerson) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button size="sm" onClick={() => promote(person)}>
        Give them a spot
      </Button>
      <Button size="sm" variant="ghost" onClick={() => remove(person)}>
        Remove
      </Button>
    </div>
  );
}

/**
 * The list form — for a waitlist that lives inside an already-expanded row, so
 * it needs to stay visually subordinate to the roster above it. Renders nothing
 * when nobody is waiting.
 */
export function WaitlistPanel({
  entries,
  heading = "Waiting for a spot",
  ...actions
}: WaitlistActions & { entries: WaitlistPerson[]; heading?: string }) {
  const { promote, remove, confirmDialog } = useWaitlistActions(actions);

  if (entries.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 font-medium">
        {heading}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          ({entries.length})
        </span>
      </h4>
      <div className="space-y-2">
        {entries.map((person) => (
          <div
            key={person.id}
            className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  #{person.position} · {person.name}
                </span>
                {person.badges}
              </div>
              <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                <div className="break-all">{person.email}</div>
                {person.phone && <div>{person.phone}</div>}
                {person.notes && <div>{person.notes}</div>}
              </div>
            </div>
            <WaitlistRowActions person={person} promote={promote} remove={remove} />
          </div>
        ))}
      </div>
      {confirmDialog}
    </div>
  );
}

/**
 * The table form — for a waitlist that is a section of its own, with room for a
 * heading and the explanation of how promotion works. Cards on mobile, table on
 * desktop, per the app's convention for 4+ columns.
 */
export function WaitlistTable({
  entries,
  heading = "Waitlist",
  ...actions
}: WaitlistActions & { entries: WaitlistPerson[]; heading?: string }) {
  const { promote, remove, confirmDialog } = useWaitlistActions(actions);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          {heading}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({entries.length})
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{WAITLIST_ADMIN_BLURB}</p>
      </div>

      {/* Mobile card view */}
      <div className="space-y-3 md:hidden">
        {entries.map((person) => (
          <div
            key={person.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="font-medium">
                #{person.position} · {person.name}
              </p>
              <p className="break-all text-sm text-muted-foreground">
                {person.email}
              </p>
              {person.phone && (
                <p className="text-sm text-muted-foreground">{person.phone}</p>
              )}
            </div>
            {person.badges && (
              <div className="mt-2 flex flex-wrap gap-1">{person.badges}</div>
            )}
            {person.notes && (
              <p className="mt-2 text-sm text-muted-foreground">{person.notes}</p>
            )}
            <div className="mt-3">
              <WaitlistRowActions
                person={person}
                promote={promote}
                remove={remove}
              />
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
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((person) => (
                <tr key={person.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">
                    {person.position}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{person.name}</span>
                    {person.badges && (
                      <span className="ml-2 inline-flex gap-1">
                        {person.badges}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="break-all">{person.email}</div>
                    {person.phone && <div>{person.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {person.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <WaitlistRowActions
                        person={person}
                        promote={promote}
                        remove={remove}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}

/** The "⭐ Would chair" chip, so committee surfaces render it identically. */
export function WouldChairBadge() {
  return <Badge variant="warning">⭐ Would chair</Badge>;
}
