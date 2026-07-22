"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  setBoardLead,
  addCommitteeChair,
  removeCommitteeChair,
} from "@/actions/year-planning";
import type { PlanAssignment, BoardMemberLoad } from "@/actions/year-planning";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DeleteIconButton } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { BOARD_LEAD_TARGET, monthLabel } from "@/lib/constants";
import { AlertCircle, Plus, Sparkles, X } from "lucide-react";

interface PlanAssignmentRowProps {
  plan: PlanAssignment;
  board: BoardMemberLoad[];
  members: { userId: string; name: string; email: string; isBoard: boolean }[];
}

/**
 * One event's ownership: the board member accountable for it, and the committee
 * chairs who run it.
 *
 * The two are separate controls rather than one "leads" list because they're
 * different questions with different answers — the board lead is one person
 * drawn from the board, and the chairs are however many parents took it on.
 */
export function PlanAssignmentRow({
  plan,
  board,
  members,
}: PlanAssignmentRowProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [chairDialogOpen, setChairDialogOpen] = useState(false);

  function run(action: () => Promise<unknown>, failure: string) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : `${failure}.`,
          "destructive"
        );
      }
    });
  }

  const volunteerIds = new Set(plan.volunteeredToLead.map((v) => v.userId));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/events/${plan.planId}`}
          className="text-sm font-medium hover:underline"
        >
          {plan.title}
        </Link>
        {plan.typicalMonth && (
          <span className="text-xs text-muted-foreground">
            {monthLabel(plan.typicalMonth)}
          </span>
        )}
        {!plan.boardLead &&
          (plan.unclassifiedLeads.length > 0 ? (
            <Badge variant="outline">Lead not classified</Badge>
          ) : (
            <Badge variant="outline">No board lead</Badge>
          ))}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`lead-${plan.planId}`}>Board Lead</Label>
          <select
            id={`lead-${plan.planId}`}
            value={plan.boardLead?.userId ?? ""}
            disabled={pending}
            onChange={(e) =>
              run(
                () => setBoardLead(plan.planId, e.target.value || null),
                "Couldn't set the board lead"
              )
            }
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="">Unassigned</option>
            {board.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} ({m.eventCount}
                {m.eventCount > BOARD_LEAD_TARGET.max ? " — over" : ""})
                {volunteerIds.has(m.userId) ? " ★" : ""}
              </option>
            ))}
          </select>
          {/* A lead from before this screen existed holds the plan but counts
              towards nobody's workload, so it has to be visible and it has to
              be obvious what to do about it — picking them above, or adding
              them as a chair, files them for good. */}
          {plan.unclassifiedLeads.length > 0 && (
            <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span>
                Already leading:{" "}
                {plan.unclassifiedLeads.map((l) => l.name).join(", ")} — set
                them as board lead or add them as a chair to record which.
              </span>
            </p>
          )}
          {/* Interest was collected months ago on the event catalog; surfacing
              it here is the only moment it can actually change a decision. */}
          {plan.volunteeredToLead.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 shrink-0 text-amber-500" />
              Volunteered to lead:{" "}
              {plan.volunteeredToLead.map((v) => v.name).join(", ")}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Committee Chair</Label>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setChairDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {plan.committeeChairs.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">None yet</p>
          ) : (
            <div className="mt-1 space-y-1">
              {plan.committeeChairs.map((chair) => (
                <div
                  key={chair.memberId}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{chair.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {chair.userId
                        ? chair.email
                        : chair.email || "No account yet"}
                    </p>
                  </div>
                  {!chair.userId && (
                    <Badge variant="outline" className="shrink-0">
                      Not joined
                    </Badge>
                  )}
                  <DeleteIconButton
                    onClick={() =>
                      run(
                        () => removeCommitteeChair(chair.memberId),
                        "Couldn't remove that chair"
                      )
                    }
                    busy={pending}
                    aria-label={`Remove ${chair.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </DeleteIconButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddChairDialog
        open={chairDialogOpen}
        onOpenChange={setChairDialogOpen}
        planTitle={plan.title}
        members={members}
        onSubmit={(chair) =>
          run(async () => {
            await addCommitteeChair(plan.planId, chair);
            setChairDialogOpen(false);
          }, "Couldn't add that chair")
        }
        pending={pending}
      />
    </div>
  );
}

/**
 * Naming a chair, whether or not they use Dragon Hub.
 *
 * Chairs are settled in August and a good half of them have never signed in, so
 * a name alone has to be enough. Picking an existing member is the better
 * outcome where it's possible — that person gets access to the plan — so it's
 * offered first, with the name-only path underneath rather than behind a tab.
 */
function AddChairDialog({
  open,
  onOpenChange,
  planTitle,
  members,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planTitle: string;
  members: { userId: string; name: string; email: string; isBoard: boolean }[];
  onSubmit: (chair: { userId: string } | { name: string; email?: string }) => void;
  pending: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function reset() {
    setUserId("");
    setName("");
    setEmail("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a committee chair</DialogTitle>
          <DialogDescription>
            The parent running {planTitle}. Chairs get full lead access to the
            plan but aren&rsquo;t counted against the board&rsquo;s workload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="chair-member">Someone at this school</Label>
            <select
              id="chair-member"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                if (e.target.value) {
                  setName("");
                  setEmail("");
                }
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a member…</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.isBoard ? " (board)" : ""} — {m.email}
                </option>
              ))}
            </select>
          </div>

          <div className="relative text-center">
            <span className="bg-background px-2 text-xs text-muted-foreground">
              or, if they don&rsquo;t have an account yet
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="chair-name">Name</Label>
              <Input
                id="chair-name"
                value={name}
                placeholder="Jamie Rivera"
                onChange={(e) => {
                  setName(e.target.value);
                  if (e.target.value) setUserId("");
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="chair-email">Email (optional)</Label>
              <Input
                id="chair-email"
                type="email"
                value={email}
                placeholder="jamie@example.com"
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A chair added by name is recorded on the plan but has no access
            until they&rsquo;re invited by email from the event page and accept.
          </p>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || (!userId && !name.trim())}
            onClick={() =>
              onSubmit(
                userId
                  ? { userId }
                  : { name: name.trim(), email: email.trim() || undefined }
              )
            }
          >
            {pending ? "Adding…" : "Add chair"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
