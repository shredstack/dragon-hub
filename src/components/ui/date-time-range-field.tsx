"use client";

/**
 * A start/end pair of `datetime-local` inputs — the shape every dated thing a
 * user creates in this app happens to be. A committee's opens/closes window, a
 * scavenger hunt's, and a Meet the Masters slot's start and end are all this
 * control with different labels.
 *
 * It exists to stop the fourth hand-rolled copy: the conversion in and out of a
 * zone-naive input is subtle (see `date-time-input.ts`), and "ends before it
 * starts" was unvalidated everywhere.
 *
 * Controlled, with raw `datetime-local` strings in and out — deliberately not
 * ISO instants. Forms keep string state while a value is half-typed, and
 * converting on every keystroke would make a partially-entered date unrepresentable.
 * Convert at submit with `fromDateTimeInputValue`.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isEndBeforeStart } from "@/lib/date-time-input";
import { cn } from "@/lib/utils";

export interface DateTimeRangeFieldProps {
  /** Namespaces the two input ids, so several ranges can share a form. */
  idPrefix: string;
  /** Raw `datetime-local` values, e.g. "2026-08-17T09:30". */
  startValue: string;
  endValue: string;
  onChange: (next: { startValue: string; endValue: string }) => void;
  startLabel?: string;
  endLabel?: string;
  startHint?: string;
  endHint?: string;
  /** Marks the start with a `*`. The end is optional in every current caller. */
  startRequired?: boolean;
  disabled?: boolean;
  className?: string;
  /**
   * Replaces the built-in "ends before it starts" warning — for a caller whose
   * range means something else ("closes" before "opens" is the same mistake,
   * but worth saying in its own words).
   */
  invalidRangeMessage?: string;
}

export function DateTimeRangeField({
  idPrefix,
  startValue,
  endValue,
  onChange,
  startLabel = "Starts",
  endLabel = "Ends",
  startHint,
  endHint,
  startRequired = false,
  disabled = false,
  className,
  invalidRangeMessage,
}: DateTimeRangeFieldProps) {
  const startId = `${idPrefix}-start`;
  const endId = `${idPrefix}-end`;
  const invalid = isEndBeforeStart(startValue, endValue);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={startId}>
            {startLabel}
            {startRequired && " *"}
          </Label>
          <Input
            id={startId}
            type="datetime-local"
            className="mt-1"
            value={startValue}
            disabled={disabled}
            onChange={(e) =>
              onChange({ startValue: e.target.value, endValue })
            }
          />
          {startHint && (
            <p className="text-muted-foreground mt-1 text-xs">{startHint}</p>
          )}
        </div>

        <div>
          <Label htmlFor={endId}>{endLabel}</Label>
          <Input
            id={endId}
            type="datetime-local"
            className="mt-1"
            value={endValue}
            disabled={disabled}
            // `min` gets the browser to mark the field invalid too, but it is
            // advisory only — Safari ignores it on this input type, which is
            // why the message below is the real feedback.
            min={startValue || undefined}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange({ startValue, endValue: e.target.value })}
          />
          {endHint && !invalid && (
            <p className="text-muted-foreground mt-1 text-xs">{endHint}</p>
          )}
        </div>
      </div>

      {invalid && (
        <p className="text-sm text-red-600">
          {invalidRangeMessage ??
            `${endLabel} needs to be after ${startLabel.toLowerCase()}.`}
        </p>
      )}
    </div>
  );
}

/**
 * Whether a range is safe to submit. Callers disable their save button on this
 * rather than re-deriving the rule, so the message and the block can't disagree.
 */
export function isDateTimeRangeValid(
  startValue: string,
  endValue: string
): boolean {
  return !isEndBeforeStart(startValue, endValue);
}
