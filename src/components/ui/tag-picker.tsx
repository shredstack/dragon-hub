"use client";

import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { findSimilarTags } from "@/lib/tags";

interface TagPickerProps {
  /** Normalized (lowercase) tag names currently applied. */
  value: string[];
  onChange: (tags: string[]) => void;
  /** The school's configured tags, for suggestions. */
  available?: { name: string; displayName: string }[];
  label?: string;
  helpText?: string;
  disabled?: boolean;
}

/**
 * Tag entry against the school's shared tag vocabulary.
 *
 * Suggestions come from the tags configured in the PTA Board Hub, but typing a
 * new one is allowed — a board member tagging an event at 10pm shouldn't have to
 * go configure a tag first. New names are created on save by ensureTagsExist,
 * which is the same path the rest of the app uses.
 */
export function TagPicker({
  value,
  onChange,
  available = [],
  label = "Tags",
  helpText,
  disabled,
}: TagPickerProps) {
  const [draft, setDraft] = useState("");

  const displayNameFor = useMemo(() => {
    const map = new Map(available.map((t) => [t.name, t.displayName]));
    return (name: string) => map.get(name) ?? name;
  }, [available]);

  const unusedTags = useMemo(
    () => available.filter((t) => !value.includes(t.name)),
    [available, value]
  );

  // With no query, suggest the school's vocabulary; while typing, rank by
  // similarity so "bookfair" or "book fairs" still surfaces "Book Fair"
  // instead of quietly creating a near-duplicate on save.
  const suggestions = useMemo(() => {
    if (!draft.trim()) return unusedTags.slice(0, 8);
    return findSimilarTags(draft, unusedTags, 8);
  }, [unusedTags, draft]);

  /** True once the draft is a genuinely new name, not one of the suggestions. */
  const isNewTag = useMemo(() => {
    const name = draft.toLowerCase().trim();
    return (
      !!name &&
      !value.includes(name) &&
      !available.some((t) => t.name === name)
    );
  }, [draft, value, available]);

  function addTag(raw: string) {
    const name = raw.toLowerCase().trim();
    if (!name || value.includes(name)) {
      setDraft("");
      return;
    }
    onChange([...value, name]);
    setDraft("");
  }

  function removeTag(name: string) {
    onChange(value.filter((t) => t !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium">{label}</label>}

      <div className="flex flex-wrap gap-1.5">
        {value.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full bg-dragon-blue-100 px-2.5 py-1 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-300"
          >
            {displayNameFor(name)}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(name)}
                aria-label={`Remove ${displayNameFor(name)} tag`}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground">No tags yet</span>
        )}
      </div>

      {!disabled && (
        <>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a tag and press Enter"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => addTag(draft)}
              disabled={!draft.trim()}
              className="shrink-0 rounded-md border border-input px-3 text-sm disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">Add tag</span>
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              {isNewTag && (
                <p className="text-xs text-muted-foreground">
                  Existing tags that might be what you mean:
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => addTag(tag.name)}
                    className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/70"
                  >
                    + {tag.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isNewTag && (
            <p className="text-xs text-muted-foreground">
              &ldquo;{draft.trim()}&rdquo; will be created as a new tag.
            </p>
          )}
        </>
      )}

      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}
