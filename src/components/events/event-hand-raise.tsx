"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Hand, Loader2, Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { setEventInterest } from "@/actions/event-directory";
import type { MemberInterestLevel } from "@/lib/event-directory-shared";
import { cn } from "@/lib/utils";

/**
 * "I'd help" / "I'd like to lead" — the middle verb.
 *
 * Instant, no approval, and it grants nothing: it is a private signal to the
 * board that survives into Plan the Year. That is the whole reason it is a
 * separate control from "Ask to join planning" below it on the detail page —
 * "I'd help at Field Day" must not silently drop someone into a workspace
 * where the treasurer is discussing check numbers.
 *
 * Tapping the level you already hold takes it back, the way a toggle should.
 */
export function EventHandRaise({
  eventCatalogId,
  interest,
  note,
  showNote = false,
  className,
}: {
  eventCatalogId: string;
  interest: MemberInterestLevel | null;
  note?: string | null;
  /** The detail page offers a line to the board; a card doesn't have room. */
  showNote?: boolean;
  className?: string;
}) {
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();
  // Optimistic rather than plain state, and that matters beyond the instant
  // feel: the same event can be on the page twice (a card in "Coming up next"
  // and its twin in "All our events"), and the Timeline/Grid toggle remounts
  // every card. `useOptimistic` falls back to the prop the moment the action's
  // `revalidatePath("/events")` lands, so both copies agree and a remount
  // can't roll a just-raised hand back down.
  const [current, setCurrent] = useOptimistic(interest);
  const [text, setText] = useState(note ?? "");
  const [noteOpen, setNoteOpen] = useState(false);

  const choose = (level: MemberInterestLevel, notes?: string) => {
    const next = current === level && notes === undefined ? null : level;
    startTransition(async () => {
      setCurrent(next);
      try {
        await setEventInterest(eventCatalogId, next, notes ?? text);
        addToast(
          next
            ? next === "lead"
              ? "The board will see you'd like to lead this."
              : "The board will see you'd help with this."
            : "Hand lowered.",
          "success"
        );
      } catch (error) {
        // No manual rollback: leaving the transition drops the optimistic
        // value back to the server's, which is still the old one.
        addToast(
          error instanceof Error ? error.message : "Couldn't save that.",
          "destructive"
        );
      }
    });
  };

  const buttonClass = (level: MemberInterestLevel) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
      "motion-safe:active:scale-95",
      current === level
        ? "border-dragon-blue-500 bg-dragon-blue-500/10 text-dragon-blue-700 dark:text-dragon-blue-300"
        : "border-border bg-card text-muted-foreground hover:bg-muted"
    );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            choose("help");
          }}
          aria-pressed={current === "help"}
          disabled={isPending}
          className={buttonClass("help")}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Hand className="h-4 w-4" />
          )}
          I&rsquo;d help
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            choose("lead");
          }}
          aria-pressed={current === "lead"}
          disabled={isPending}
          className={buttonClass("lead")}
        >
          <Star className="h-4 w-4" />
          I&rsquo;d like to lead
        </button>
        {showNote && current && (
          <button
            type="button"
            onClick={() => setNoteOpen((open) => !open)}
            className="text-muted-foreground text-sm hover:underline"
          >
            {text ? "Edit your note" : "Add a note"}
          </button>
        )}
      </div>

      {showNote && noteOpen && current && (
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Anything the board should know — &ldquo;weekday mornings work best&rdquo;."
          />
          <button
            type="button"
            onClick={() => {
              choose(current, text);
              setNoteOpen(false);
            }}
            disabled={isPending}
            className="text-dragon-blue-600 dark:text-dragon-blue-400 text-sm hover:underline"
          >
            Save note
          </button>
        </div>
      )}

      {showNote && (
        <p className="text-muted-foreground text-xs">
          Raising a hand is a signal to the board, not an assignment — and only
          the board sees it.
        </p>
      )}
    </div>
  );
}
