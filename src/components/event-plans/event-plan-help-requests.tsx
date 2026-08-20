"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
        <div
          key={person.id}
          className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{person.name}</span>
              <PersonBadges badges={person.badges} />
            </div>
            <div className="text-muted-foreground mt-1 space-y-0.5 text-sm">
              <div className="break-all">{person.email}</div>
              {person.notes && <div className="italic">“{person.notes}”</div>}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => approve(person)} disabled={isPending}>
              Add to the team
            </Button>
          </div>
        </div>
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
