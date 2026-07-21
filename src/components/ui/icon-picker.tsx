"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MediaPicker } from "@/components/media/media-picker";

/**
 * A starter palette so a board member can make an event stand out in one tap
 * instead of hunting through the system emoji picker.
 */
export const SUGGESTED_EMOJI = [
  "🐉", "🎃", "💝", "🎨", "🏃", "📚", "🍎", "🎪", "🌮", "🎵",
  "🔬", "🌱", "🎬", "🏆", "🎁", "☕", "🧁", "🎓", "🌟", "🤝",
];

interface IconPickerProps {
  iconEmoji: string;
  imageUrl: string;
  onChange: (value: { iconEmoji: string; imageUrl: string }) => void;
  label?: string;
}

/**
 * Emoji-or-image chooser for anything a parent will scan a list of.
 *
 * Shared by the recurring event catalog and volunteer campaign events so the
 * icon a board member picks once looks the same everywhere it surfaces.
 */
export function IconPicker({
  iconEmoji,
  imageUrl,
  onChange,
  label = "Icon",
}: IconPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div>
        <Label className="mb-2 block">{label}</Label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">
            {imageUrl ? (
              <div className="relative h-12 w-12 overflow-hidden rounded-lg">
                <Image
                  src={imageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="48px"
                  unoptimized
                />
              </div>
            ) : (
              iconEmoji || "📌"
            )}
          </div>
          <Input
            value={iconEmoji}
            onChange={(e) => onChange({ iconEmoji: e.target.value, imageUrl })}
            placeholder="Paste an emoji"
            className="max-w-[10rem]"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setPickerOpen(true)}
          >
            {imageUrl ? "Change Image" : "Use Image"}
          </Button>
          {imageUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange({ iconEmoji, imageUrl: "" })}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {SUGGESTED_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange({ iconEmoji: emoji, imageUrl: "" })}
              className="rounded p-1 text-xl hover:bg-muted"
              aria-label={`Use ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          An image takes priority over the emoji when both are set.
        </p>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(item) => {
          onChange({ iconEmoji, imageUrl: item.blobUrl });
          setPickerOpen(false);
        }}
      />
    </>
  );
}
