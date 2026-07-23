"use client";

import { useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resendMemberInvite } from "@/actions/pending-members";

interface ResendInviteButtonProps {
  email: string;
  /** Compact icon-only button for table rows; full-width labelled for the dialog. */
  variant?: "row" | "block";
}

/**
 * Re-sends the one-click sign-in link to someone who signed up but never
 * verified their email, so the PTA board can nudge them into DragonHub.
 */
export function ResendInviteButton({
  email,
  variant = "row",
}: ResendInviteButtonProps) {
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        const result = await resendMemberInvite(email);
        if (result.success) {
          addToast(`Sign-in link re-sent to ${email}.`, "success");
        } else {
          addToast(result.error ?? "Couldn't resend the invite.", "destructive");
        }
      } catch {
        addToast("Couldn't resend the invite. Please try again.", "destructive");
      }
    });
  };

  if (variant === "block") {
    return (
      <Button
        onClick={handleClick}
        disabled={isPending}
        className="w-full"
        variant="outline"
      >
        <Mail className="h-4 w-4" />
        {isPending ? "Sending…" : "Resend sign-in link"}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleClick}
      disabled={isPending}
      title="Resend sign-in link"
      className="text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Mail className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only sm:ml-1">
        {isPending ? "Sending…" : "Resend"}
      </span>
    </Button>
  );
}
