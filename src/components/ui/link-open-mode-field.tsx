"use client";

import { AppWindow, SquareArrowOutUpRight } from "lucide-react";
import type { LinkOpenMode } from "@/lib/links-shared";

/**
 * The "How it opens" choice, wherever someone can enter a link.
 *
 * Shared so the wording stays identical everywhere — the honest caveat ("some
 * sites refuse this") is the part that matters, and it should read the same on
 * the dashboard links screen as it does on a hunt item. Pairs with `SmartLink`,
 * which renders whatever gets chosen here.
 *
 * Callers should default the value with `defaultOpenModeFor(url)` when the URL
 * changes rather than hard-coding a mode.
 */
export function LinkOpenModeField({
  value,
  onChange,
  label = "How it opens",
  disabled,
}: {
  value: LinkOpenMode;
  onChange: (mode: LinkOpenMode) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <OpenModeOption
          selected={value === "new_tab"}
          onSelect={() => onChange("new_tab")}
          disabled={disabled}
          icon={<SquareArrowOutUpRight className="h-4 w-4" />}
          title="New tab"
          hint="Always works. Leaves DragonHub."
        />
        <OpenModeOption
          selected={value === "in_app"}
          onSelect={() => onChange("in_app")}
          disabled={disabled}
          icon={<AppWindow className="h-4 w-4" />}
          title="Inside DragonHub"
          hint="Opens in a window over the page. Some sites refuse this — test it after saving."
        />
      </div>
    </div>
  );
}

function OpenModeOption({
  selected,
  onSelect,
  disabled,
  icon,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
        selected
          ? "border-dragon-blue-500 bg-dragon-blue-50"
          : "border-border hover:bg-muted/50"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

/**
 * The same choice as a compact badge, for a list row summarizing a saved link.
 */
export function LinkOpenModeBadge({ mode }: { mode: LinkOpenMode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {mode === "in_app" ? (
        <>
          <AppWindow className="h-3 w-3" />
          Opens here
        </>
      ) : (
        <>
          <SquareArrowOutUpRight className="h-3 w-3" />
          New tab
        </>
      )}
    </span>
  );
}
