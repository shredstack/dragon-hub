"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { CapacityNote } from "@/components/volunteer/capacity-note";
import {
  requestToHelpWithEvent,
  withdrawHelpRequest,
} from "@/actions/event-directory";
import {
  capacitySentence,
  isDeadEnd,
  joinButtonLabel,
} from "@/lib/waitlist-shared";
import { WaitlistSummary } from "@/components/volunteer/waitlist-summary";
import type { CapacityState } from "@/lib/waitlist-shared";
import type { MyHelpRequest } from "@/lib/event-directory-shared";

/**
 * "Ask to join planning" — the third verb, and the only one that grants
 * **access**: the plan's message board, its tasks, its vendor contacts, its
 * reimbursements. That is why it is a request with a decision behind it and the
 * hand-raise above isn't; approval here is not gatekeeping enthusiasm, it is
 * the same door check `event_plan_invites` already makes.
 *
 * Six states, and a parent sees the wall before they hit it: the button already
 * reads "Join the waitlist" on a full team, and a full team with the waitlist
 * switched off shows the count and no button at all rather than one that can't
 * work. Every string comes from `waitlist-shared.ts`, so this reads the same as
 * a full committee and a full classroom.
 */
export function EventJoinPanel({
  eventCatalogId,
  eventTitle,
  capacity,
  request,
  onTeam,
  planId,
  planningStarted,
}: {
  eventCatalogId: string;
  eventTitle: string;
  capacity: CapacityState;
  request: MyHelpRequest | null;
  onTeam: boolean;
  planId: string | null;
  planningStarted: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [asking, setAsking] = useState(false);

  const deadEnd = isDeadEnd(capacity);
  const sentence = capacitySentence(capacity);

  const ask = () => {
    startTransition(async () => {
      try {
        await requestToHelpWithEvent(eventCatalogId, message);
        addToast("Your request is with the board.", "success");
        setAsking(false);
        setMessage("");
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't send that.",
          "destructive"
        );
      }
    });
  };

  const withdraw = () => {
    if (!request) return;
    startTransition(async () => {
      try {
        await withdrawHelpRequest(request.id);
        addToast("Withdrawn.", "success");
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't withdraw that.",
          "destructive"
        );
      }
    });
  };

  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Help plan {eventTitle}</h2>
        <CapacityNote state={capacity} />
      </div>

      {/* 1 — Already on the team. The button is never offered in this state. */}
      {onTeam && planId ? (
        <div className="mt-3">
          <p className="text-muted-foreground text-sm">
            You&rsquo;re on this team.
          </p>
          <Link
            href={`/events/plans/${planId}`}
            className="text-dragon-blue-600 dark:text-dragon-blue-400 mt-1 inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            Open the planning workspace
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : request?.status === "approved" ? (
        <p className="text-muted-foreground mt-3 text-sm">
          You&rsquo;re on this team.
        </p>
      ) : request?.status === "waitlisted" ? (
        /* 2 — In the line. The same amber card, the same sentence and the same
               icon a full committee or a full classroom gives, because it is
               the same promise. */
        <div className="mt-3 space-y-2">
          <WaitlistSummary
            placements={[{ name: eventTitle, position: request.position ?? 1 }]}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={withdraw}
            disabled={isPending}
          >
            Take me off the list
          </Button>
        </div>
      ) : request?.status === "pending" ? (
        /* 3 — Asked, waiting on a person. */
        <div className="mt-3 space-y-2">
          <p className="text-muted-foreground text-sm">
            Your request is with{" "}
            {planningStarted ? "this event's leads" : "the PTA board"}.
            You&rsquo;ll hear back.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={withdraw}
            disabled={isPending}
          >
            Never mind
          </Button>
        </div>
      ) : request?.status === "declined" ? (
        /* 4 — Declined. Quiet and kind: no lingering badge, and the honest
               next step is offered instead. */
        <div className="mt-3 space-y-1">
          <p className="text-muted-foreground text-sm">
            {request.decisionNote ??
              "The team for this one is set for now — thank you for offering."}
          </p>
          <p className="text-muted-foreground text-sm">
            Raising a hand above keeps you on the board&rsquo;s list for next
            time.
          </p>
        </div>
      ) : deadEnd ? (
        /* 5 — Full, with nowhere to put the overflow. Say so plainly rather
               than offering a button that can't work. */
        <p className="text-muted-foreground mt-3 text-sm">
          {sentence} Raising a hand above still tells the board you&rsquo;re
          interested.
        </p>
      ) : (
        /* 6 — Not asked yet. */
        <div className="mt-3 space-y-3">
          {sentence && (
            <p className="text-muted-foreground text-sm">{sentence}</p>
          )}
          {!planningStarted && (
            <p className="text-muted-foreground text-sm">
              Planning hasn&rsquo;t started for this year yet. Ask anyway —
              the board will pick it up when it does.
            </p>
          )}
          {asking ? (
            <div className="space-y-2">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Anything you'd like them to know — &ldquo;I ran this at our old school.&rdquo;"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={ask} disabled={isPending}>
                  {isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Send request
                </Button>
                <Button variant="ghost" onClick={() => setAsking(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setAsking(true)}>
              {joinButtonLabel(capacity, "Ask to join planning")}
            </Button>
          )}
          <p className="text-muted-foreground text-xs">
            This one needs a yes: joining the team opens the event&rsquo;s
            message board, tasks and budget.
          </p>
        </div>
      )}
    </div>
  );
}
