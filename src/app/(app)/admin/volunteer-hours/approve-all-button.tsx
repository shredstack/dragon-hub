"use client";

import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { approveAllPendingHours } from "@/actions/volunteer-hours";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { haptic } from "@/lib/haptics";

/**
 * The whole queue, in one press.
 *
 * Confirmed rather than immediate — not because approving is destructive, but
 * because it is *invisible*: the rows vanish and there is no undo short of the
 * parent re-logging them. The count is in the question so a board member who
 * meant to clear four entries and is about to clear forty finds out first.
 */
export function ApproveAllButton({ pendingCount }: { pendingCount: number }) {
  const { confirm, confirmDialog } = useConfirm();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();

  if (pendingCount === 0) return null;

  const entries = `${pendingCount} ${pendingCount === 1 ? "entry" : "entries"}`;

  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Approve all ${entries}?`,
            description:
              "Everything currently waiting for review will be approved and each volunteer told once.",
            alternative:
              "Reviewing them one at a time lets you return anything that looks wrong.",
            confirmLabel: `Approve ${entries}`,
            tone: "default",
          });
          if (!ok) return;

          startTransition(async () => {
            try {
              const { approved } = await approveAllPendingHours();
              haptic("success");
              addToast(
                approved === 0
                  ? "Nothing left to approve — someone else cleared the queue."
                  : `Approved ${approved} ${approved === 1 ? "entry" : "entries"}.`,
                approved === 0 ? "default" : "success"
              );
            } catch {
              addToast("Couldn't approve those hours. Try again.", "destructive");
            }
          });
        }}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCheck className="h-4 w-4" />
        )}
        Approve all {pendingCount}
      </Button>
      {confirmDialog}
    </>
  );
}
