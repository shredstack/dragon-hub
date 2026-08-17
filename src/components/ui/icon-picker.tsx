"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { EmojiPicker, SUGGESTED_EMOJI } from "@/components/ui/emoji-picker";
import { MediaPicker } from "@/components/media/media-picker";

export { SUGGESTED_EMOJI };

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
 * icon a board member picks once looks the same everywhere it surfaces. The
 * emoji half is `EmojiPicker`, the same one classrooms and hunt items use.
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
      <EmojiPicker
        label={label}
        value={iconEmoji}
        onChange={(value, source) =>
          onChange({
            iconEmoji: value,
            // Tapping the palette is a choice of emoji over the image it would
            // otherwise hide; typing beside an image is not.
            imageUrl: source === "suggestion" ? "" : imageUrl,
          })
        }
        preview={
          imageUrl ? (
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
          ) : undefined
        }
        trailing={
          <>
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
          </>
        }
        hint="An image takes priority over the emoji when both are set."
      />

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
