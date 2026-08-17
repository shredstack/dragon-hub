"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isEmojiOrEmpty } from "@/lib/emoji";

/**
 * A starter palette so someone can make a thing stand out in one tap instead of
 * hunting through the system emoji keyboard. Surfaces with their own subject
 * matter (a scavenger hunt, a classroom) pass their own list.
 */
export const SUGGESTED_EMOJI = [
  "🐉", "🎃", "💝", "🎨", "🏃", "📚", "🍎", "🎪", "🌮", "🎵",
  "🔬", "🌱", "🎬", "🏆", "🎁", "☕", "🧁", "🎓", "🌟", "🤝",
];

interface EmojiPickerProps {
  value: string;
  /**
   * `source` distinguishes a tap on the palette from typing, which the icon
   * picker needs: choosing an emoji there means dropping the image it would
   * otherwise sit behind.
   */
  onChange: (emoji: string, source: "input" | "suggestion") => void;
  /** Pass `null` for a field that supplies its own heading. */
  label?: string | null;
  /** Shown in the preview tile while nothing is picked. */
  fallback?: ReactNode;
  suggestions?: readonly string[];
  /** Replaces the tile's contents entirely — an uploaded image, say. */
  preview?: ReactNode;
  /** Extra controls beside the text input, on the same row. */
  trailing?: ReactNode;
  hint?: ReactNode;
}

/**
 * The one emoji chooser in the app: a preview, a box to paste into, and a
 * palette to tap.
 *
 * Everywhere an emoji is stored uses it — the icon picker (which layers an
 * image on top via `preview`/`trailing`), scavenger hunt items, classrooms — so
 * the palette, the validation and the "Paste an emoji" affordance can't drift
 * apart per surface.
 */
export function EmojiPicker({
  value,
  onChange,
  label = "Emoji",
  fallback = "📌",
  suggestions = SUGGESTED_EMOJI,
  preview,
  trailing,
  hint,
}: EmojiPickerProps) {
  // Typed text that isn't an emoji would be silently dropped on save, so say so
  // here rather than letting someone wonder where their word went.
  const invalid = !isEmojiOrEmpty(value);

  return (
    <div>
      {label !== null && <Label className="mb-2 block">{label}</Label>}
      <div className="flex flex-wrap items-center gap-3">
        {/* `overflow-hidden` because the box takes free text: a half-typed word
            would otherwise push the row apart before it's rejected below. */}
        <div className="bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg text-2xl">
          {preview ?? (value || fallback)}
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value, "input")}
          placeholder="Paste an emoji"
          className="max-w-[10rem]"
          aria-invalid={invalid || undefined}
        />
        {trailing}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {suggestions.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onChange(emoji, "suggestion")}
            className="hover:bg-muted rounded p-1 text-xl"
            aria-label={`Use ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      {invalid && (
        <p className="text-destructive mt-1 text-xs">
          That isn&apos;t an emoji — pick one above or paste one from your
          keyboard.
        </p>
      )}
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}
