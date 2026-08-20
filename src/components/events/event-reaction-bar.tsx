"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { useToast } from "@/components/ui/toast";
import { toggleEventReaction } from "@/actions/event-directory";
import {
  canonicalizeReaction,
  reactionButtonLabel,
  SUGGESTED_EVENT_REACTIONS,
  visibleReactions,
  type ReactionTally,
} from "@/lib/event-reactions-shared";
import { cn } from "@/lib/utils";

/**
 * The one control on this page that is purely for fun.
 *
 * A row of emoji pills with counts, the reader's own highlighted, and a "+"
 * that opens the app's one `EmojiPicker` with the curated shortlist as
 * `suggestions` — the same control as classrooms and scavenger hunt items, so
 * its palette, its validation and its "Browse all" can't drift per surface.
 *
 * `onChange`'s `source` is ignored here (typing an emoji and tapping one mean
 * the same thing), but the value still goes through `canonicalizeReaction()` on
 * both sides, so a pasted "❤" joins the picker's "❤️" instead of splitting the
 * count.
 *
 * The pop is CSS. No confetti library: this page ships inside the native
 * shell's WebView and every kilobyte is a parent's cell connection.
 */
export function EventReactionBar({
  eventCatalogId,
  reactions,
  customEmojiEnabled,
  reactorNames,
  size = "sm",
}: {
  eventCatalogId: string;
  reactions: ReactionTally[];
  customEmojiEnabled: boolean;
  /** Emoji → names, present only when the school shows who reacted. */
  reactorNames?: Record<string, string[]>;
  size?: "sm" | "lg";
}) {
  const { addToast } = useToast();
  const [, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState("");

  // Optimistic so a tap feels instant on a phone: the count moves, then the
  // server agrees. A failure re-renders from the server value and toasts.
  const [tallies, applyTap] = useOptimistic(
    reactions,
    (current: ReactionTally[], reaction: string) => {
      const existing = current.find((t) => t.reaction === reaction);
      if (!existing) {
        return [...current, { reaction, count: 1, mine: true }];
      }
      const next = existing.mine
        ? { ...existing, count: existing.count - 1, mine: false }
        : { ...existing, count: existing.count + 1, mine: true };
      return current
        .map((t) => (t.reaction === reaction ? next : t))
        .filter((t) => t.count > 0);
    }
  );

  const { shown, hidden } = visibleReactions(tallies);

  const tap = (raw: string) => {
    const reaction = canonicalizeReaction(raw);
    if (!reaction) {
      addToast("That isn't an emoji.", "destructive");
      return;
    }
    setPicking(false);
    setCustom("");
    startTransition(async () => {
      applyTap(reaction);
      try {
        await toggleEventReaction(eventCatalogId, reaction);
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't save that.",
          "destructive"
        );
      }
    });
  };

  const pill = size === "lg" ? "px-3 py-1.5 text-base" : "px-2.5 py-1 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((tally) => (
        <button
          key={tally.reaction}
          type="button"
          // Cards are links; the buttons on them are not part of the link.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            tap(tally.reaction);
          }}
          aria-pressed={tally.mine}
          aria-label={reactionButtonLabel(tally.reaction, tally.mine)}
          title={reactorNames?.[tally.reaction]?.join(", ")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border transition-transform",
            // `active:scale` rather than an animation, so it costs nothing and
            // `prefers-reduced-motion` has nothing to fight.
            "motion-safe:active:scale-95",
            pill,
            tally.mine
              ? "border-dragon-blue-500 bg-dragon-blue-500/10 text-dragon-blue-700 dark:text-dragon-blue-300"
              : "border-border bg-card text-muted-foreground hover:bg-muted"
          )}
        >
          <span aria-hidden>{tally.reaction}</span>
          <span className="tabular-nums">{tally.count}</span>
        </button>
      ))}

      {hidden > 0 && (
        <span className="text-muted-foreground text-xs">+{hidden} more</span>
      )}

      {customEmojiEnabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPicking((open) => !open);
          }}
          aria-expanded={picking}
          aria-label="React with another emoji"
          className={cn(
            "border-border text-muted-foreground hover:bg-muted inline-flex items-center rounded-full border border-dashed",
            pill
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      {picking && (
        <div
          className="border-border bg-card mt-2 w-full rounded-lg border p-3"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <EmojiPicker
            value={custom}
            label={null}
            suggestions={SUGGESTED_EVENT_REACTIONS}
            onChange={(emoji, source) => {
              // Typing and picking mean the same thing here, so `source` is
              // ignored — but a half-typed grapheme shouldn't fire a write, so
              // only a deliberate pick submits.
              setCustom(emoji);
              if (source === "pick") tap(emoji);
            }}
            hint="Pick anything — it shows up as a reaction on this event."
          />
          {custom.trim() && (
            <button
              type="button"
              onClick={() => tap(custom)}
              className="text-dragon-blue-600 dark:text-dragon-blue-400 mt-2 text-sm hover:underline"
            >
              Use {custom}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
