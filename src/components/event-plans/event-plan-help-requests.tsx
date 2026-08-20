"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PersonBadges } from "@/components/ui/person-badges";
import { CapacityNote } from "@/components/volunteer/capacity-note";
import {
  WaitlistPanel,
  type WaitlistPerson,
} from "@/components/volunteer/waitlist-panel";
import { promoteOverCapacityCopy } from "@/lib/waitlist-shared";
import type { CapacityState } from "@/lib/waitlist-shared";
import {
  approveAllPlanHelpRequests,
  decideHelpRequest,
  promoteEventHelpRequest,
  removeEventHelpRequest,
  type HelpQueuePerson,
} from "@/actions/event-directory";

/**
 * "3 parents asked to help with Field Day" — on the plan itself.
 *
 * The board's queue at `/admin/board/event-requests` is the same data; this is
 * the copy for the person who actually owns the team, which is often a
 * committee chair who is deliberately not on the board and can't open that
 * page. Nobody is ever auto-added: the lead may already have all the hands
 * they need, so Approve-all is offered and never assumed.
 *
 * Both answers live here, for the same reason. A lead who can only say yes
 * isn't deciding anything — the request would sit pending until a board member
 * opened a page this person can't see. "Not this time" carries the same
 * optional note as the board's queue, since it is the same `decideHelpRequest`.
 */
export function EventPlanHelpRequests({
  eventPlanId,
  eventTitle,
  pending,
  waitlisted,
  capacity,
}: {
  eventPlanId: string;
  eventTitle: string;
  pending: HelpQueuePerson[];
  waitlisted: HelpQueuePerson[];
  capacity: CapacityState;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [isPending, startTransition] = useTransition();

  if (pending.length === 0 && waitlisted.length === 0) return null;

  const entries: WaitlistPerson[] = waitlisted.map((person) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    position: person.position,
    notes: person.notes,
    badges: <PersonBadges badges={person.badges} />,
  }));

  const approve = (person: HelpQueuePerson) => {
    startTransition(async () => {
      try {
        const first = await decideHelpRequest(person.id, "approve");
        if (first.promoted > 0) {
          addToast(`${person.name} is on the team.`, "success");
          router.refresh();
          return;
        }
        const override = await confirm({
          ...promoteOverCapacityCopy({
            name: person.name,
            where: eventTitle,
            taken: capacity.taken,
            limit: capacity.limit,
          }),
          confirmLabel: "Add anyway",
        });
        if (!override) {
          addToast(`${person.name} is in line.`, "default");
          router.refresh();
          return;
        }
        await decideHelpRequest(person.id, "approve", { overCapacity: true });
        addToast(`${person.name} is on the team.`, "success");
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't do that.",
          "destructive"
        );
      } finally {
        closeConfirm();
      }
    });
  };

  const decline = (person: HelpQueuePerson, note: string) => {
    startTransition(async () => {
      try {
        await decideHelpRequest(person.id, "decline", { note });
        addToast(`${person.name} has been let know.`, "success");
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't do that.",
          "destructive"
        );
      }
    });
  };

  const approveAll = () => {
    startTransition(async () => {
      try {
        const { seated, asked } = await approveAllPlanHelpRequests(eventPlanId);
        addToast(
          seated === asked
            ? `${seated} added to the team.`
            : `${seated} added; the rest are in line for a spot.`,
          "success"
        );
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't do that.",
          "destructive"
        );
      }
    });
  };

  return (
    <div className="border-border bg-card space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {pending.length > 0
              ? `${pending.length} ${
                  pending.length === 1 ? "parent" : "parents"
                } asked to help with ${eventTitle}`
              : "In line for a spot"}
          </h3>
          <CapacityNote state={capacity} />
        </div>
        {pending.length > 1 && (
          <Button size="sm" onClick={approveAll} disabled={isPending}>
            Add them all
          </Button>
        )}
      </div>

      {pending.map((person) => (
        <PendingRow
          key={person.id}
          person={person}
          busy={isPending}
          onApprove={() => approve(person)}
          onDecline={(note) => decline(person, note)}
        />
      ))}

      <WaitlistPanel
        entries={entries}
        heading="In line for a spot"
        where={eventTitle}
        taken={capacity.taken}
        limit={capacity.limit}
        onPromote={(person, options) =>
          promoteEventHelpRequest(person.id, {
            overCapacity: options.overCapacity,
          })
        }
        onRemove={(person) => removeEventHelpRequest(person.id).then(() => {})}
      />

      {confirmDialog}
    </div>
  );
}

/**
 * One undecided request, with both answers on it.
 *
 * The note is per-row local state rather than lifted, so a lead part-way
 * through writing "we're full this year, but the book fair needs you" doesn't
 * lose it when the panel re-renders around another decision.
 */
function PendingRow({
  person,
  busy,
  onApprove,
  onDecline,
}: {
  person: HelpQueuePerson;
  busy: boolean;
  onApprove: () => void;
  onDecline: (note: string) => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{person.name}</span>
          <PersonBadges badges={person.badges} />
        </div>
        <div className="text-muted-foreground mt-1 space-y-0.5 text-sm">
          <div className="break-all">{person.email}</div>
          {person.notes && <div className="italic">“{person.notes}”</div>}
        </div>

        {declining && (
          <div className="mt-2 space-y-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional — what they'll see. Leaving it blank is fine."
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onDecline(note)} disabled={busy}>
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeclining(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {!declining && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={onApprove} disabled={busy}>
            Add to the team
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeclining(true)}
            disabled={busy}
          >
            Not this time
          </Button>
        </div>
      )}
    </div>
  );
}
