"use client";

import { Button } from "@/components/ui/button";
import {
  EMAIL_CONTENT_WIDTH_PX,
  EMAIL_IMAGE_WIDTH_OPTIONS,
  type EmailImageWidth,
} from "@/lib/email/image-width";

interface ImageSizeFieldProps {
  value: EmailImageWidth;
  onChange: (value: EmailImageWidth) => void;
  /** Renamed for the header, where the image is a banner rather than a photo. */
  label?: string;
  className?: string;
}

/**
 * The one place a secretary sizes an image in the weekly email.
 *
 * There is exactly one of these, shared by the section editor, the header
 * editor and the recurring-section defaults, for the same reason there is one
 * `EmailImagePosition` control: three copies of a four-value picker is three
 * chances for one of them to drift a label or forget a size.
 *
 * The choice is per placement, not per file — sizing the photo here never
 * touches the media library, so the same image can be a hero this week and a
 * thumbnail next. Each button carries its pixel width because it is the number
 * that reaches the email, and a secretary who has been told "keep the flyer
 * under 400px" can act on it.
 */
export function ImageSizeField({
  value,
  onChange,
  label = "Image size",
  className,
}: ImageSizeFieldProps) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-medium">{label}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {EMAIL_IMAGE_WIDTH_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "secondary" : "outline"}
            size="sm"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className="h-auto flex-col gap-0.5 py-1.5"
          >
            <span className="text-xs font-medium">{option.label}</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              {option.px}px
            </span>
          </Button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Widths are against the {EMAIL_CONTENT_WIDTH_PX}px email column. Anything
        wider than the reader&apos;s screen shrinks to fit on a phone.
      </p>
    </div>
  );
}
