"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PersonBadges } from "@/components/ui/person-badges";
import { EventIcon } from "@/components/events/event-icon";
import { CapacityNote } from "@/components/volunteer/capacity-note";
import {
  WaitlistTable,
  type WaitlistPerson,
} from "@/components/volunteer/waitlist-panel";
import { promoteOverCapacityCopy } from "@/lib/waitlist-shared";
import {
  decideHelpRequest,
  promoteEventHelpRequest,
  removeEventHelpRequest,
  type HelpQueueGroup,
  type HelpQueuePerson,
} from "@/actions/event-directory";

/**
 * The board's queue of "can I help plan this?".
 *
 * Two lists per event, and they are genuinely different questions. **Pending**
 * is a decision nobody has made yet — approve or decline. **Waitlisted** is a
 * decision already made that found no seat, so it is a `WaitlistTable`,
 * unchanged, with the promotion behaviour and every string the committee and
 * room-parent waitlists already use.
 *
 * Events with no plan for this year are grouped separately by the page: there
 * is no team to seat anyone on, and saying so beats a button that throws.
 */
export function EventRequestQueue({ groups }: { groups: HelpQueueGroup[] }) {
  const withPlan = groups.filter((g) => g.eventPlanId);
  const withoutPlan = groups.filter((g) => !g.eventPlanId);

  return (
    <div className="space-y-8">
      {withPlan.map((group) => (
        <EventGroup key={group.eventCatalogId} group={group} />
      ))}

      {withoutPlan.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Waiting for a plan</h2>
            <p className="text-muted-foreground text-sm">
              Nobody can be added to a team that doesn&rsquo;t exist yet. Open
              this year&rsquo;s plan for these events and the requests come with
              it.
            </p>
            <Link
              href="/admin/board/event-plan-setup"
              className="text-dragon-blue-600 dark:text-dragon-blue-400 mt-1 inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              <CalendarPlus className="h-4 w-4" />
              Plan the Year
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {withoutPlan.map((group) => (
            <EventGroup key={group.eventCatalogId} group={group} noPlan />
          ))}
        </section>
      )}
    </div>
  );
}

function EventGroup({
  group,
  noPlan = false,
}: {
  group: HelpQueueGroup;
  noPlan?: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToast();

  const waitlistEntries: WaitlistPerson[] = group.waitlisted.map((person) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    position: person.position,
    notes: person.notes,
    badges: <PersonBadges badges={person.badges} />,
  }));

  return (
    <section className="border-border bg-card space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <EventIcon
            iconEmoji={group.iconEmoji}
            imageUrl={group.imageUrl}
            className="h-10 w-10"
          />
          <div>
            <h3 className="font-semibold">
              <Link href={`/events/${group.slug}`} className="hover:underline">
                {group.title}
              </Link>
            </h3>
            <CapacityNote state={group.capacity} />
          </div>
        </div>
        {group.eventPlanId && (
          <Link
            href={`/events/plans/${group.eventPlanId}`}
            className="text-dragon-blue-600 dark:text-dragon-blue-400 text-sm hover:underline"
          >
            Open the plan
          </Link>
        )}
      </div>

      {group.pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">
            Waiting on you{" "}
            <span className="text-muted-foreground text-sm font-normal">
              ({group.pending.length})
            </span>
          </h4>
          {group.pending.map((person) => (
            <PendingRow
              key={person.id}
              person={person}
              where={group.title}
              taken={group.capacity.taken}
              limit={group.capacity.limit}
              noPlan={noPlan}
              onDone={() => router.refresh()}
              onError={(message) => addToast(message, "destructive")}
            />
          ))}
        </div>
      )}

      {waitlistEntries.length > 0 && (
        <WaitlistTable
          entries={waitlistEntries}
          heading="In line for a spot"
          where={group.title}
          taken={group.capacity.taken}
          limit={group.capacity.limit}
          onPromote={(person, options) =>
            promoteEventHelpRequest(person.id, {
              overCapacity: options.overCapacity,
            })
          }
          onRemove={(person) => removeEventHelpRequest(person.id).then(() => {})}
        />
      )}
    </section>
  );
}

/**
 * One undecided request.
 *
 * Approving goes through the same `{ promoted: 0 }` contract the waitlist
 * panel uses: a full team is a question, not a failure, so the board is offered
 * "Add anyway" rather than told to go remove somebody.
 */
function PendingRow({
  person,
  where,
  taken,
  limit,
  noPlan,
  onDone,
  onError,
}: {
  person: HelpQueuePerson;
  where: string;
  taken: number;
  limit: number | null;
  noPlan: boolean;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  const approve = () => {
    startTransition(async () => {
      try {
        const first = await decideHelpRequest(person.id, "approve");
        if (first.promoted > 0) {
          addToast(`${person.name} is on the team.`, "success");
          onDone();
          return;
        }

        // No seat. The limit is a recruiting tool, not a cap on how many adults
        // may help, so a full team is a question — and the wording of that
        // question is the one every waitlist in the app already uses.
        const override = await confirm({
          ...promoteOverCapacityCopy({ name: person.name, where, taken, limit }),
          confirmLabel: "Add anyway",
        });
        if (!override) {
          addToast(
            `${person.name} is in line — they'll move up when a spot opens.`,
            "default"
          );
          onDone();
          return;
        }

        const forced = await decideHelpRequest(person.id, "approve", {
          overCapacity: true,
        });
        if (forced.promoted === 0) {
          onError(`Couldn't give ${person.name} a spot.`);
          return;
        }
        addToast(`${person.name} is on the team, above the limit.`, "success");
        onDone();
      } catch (error) {
        onError(
          error instanceof Error ? error.message : "Couldn't do that."
        );
      } finally {
        closeConfirm();
      }
    });
  };

  const decline = () => {
    startTransition(async () => {
      try {
        await decideHelpRequest(person.id, "decline", { note });
        addToast(`${person.name} has been let know.`, "success");
        setDeclining(false);
        onDone();
      } catch (error) {
        onError(error instanceof Error ? error.message : "Couldn't do that.");
      }
    });
  };

  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{person.name}</span>
          <PersonBadges badges={person.badges} />
        </div>
        <div className="text-muted-foreground mt-1 space-y-0.5 text-sm">
          <div className="break-all">{person.email}</div>
          {person.phone && <div>{person.phone}</div>}
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
              <Button size="sm" onClick={decline} disabled={isPending}>
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeclining(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {!declining && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={approve} disabled={isPending || noPlan}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {noPlan ? "Needs a plan first" : "Add to the team"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeclining(true)}
            disabled={isPending}
          >
            Not this time
          </Button>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
