"use client";

import * as React from "react";
import { categoryOptions, type CategorySet } from "@/lib/categories";
import { cn } from "@/lib/utils";

/**
 * The dropdown for any of the fixed category sets in `constants.ts`.
 *
 * Every screen that asks for a category was hand-rolling the same `<select>`,
 * which is how the sets drifted into two different shapes in the first place.
 * Pass the set; this handles the placeholder option and the slug/label split.
 * `CategoryBadge` (category-badge.tsx) renders the result.
 */

interface CategorySelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  set: CategorySet;
  /**
   * The empty option's text. Filters want "All categories"; forms want the
   * default, which reads as an instruction rather than a value.
   */
  placeholder?: string;
  /** Drop the empty option entirely, for a field that must have a value. */
  hidePlaceholder?: boolean;
}

export function CategorySelect({
  set,
  placeholder = "Select category",
  hidePlaceholder = false,
  className,
  ...props
}: CategorySelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring",
        className
      )}
      {...props}
    >
      {!hidePlaceholder && <option value="">{placeholder}</option>}
      {categoryOptions(set).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
