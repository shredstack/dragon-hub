"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MAILING_VARIABLES } from "@/lib/mail-merge-shared";

/**
 * The list of `{{variables}}` a template may use.
 *
 * Collapsed by default and clickable to copy: the point of a merge field is
 * that it is spelled exactly right, and typing it from memory is the one way to
 * get an email that says `{{teachers}}` to thirty families.
 */
export function VariableHelp() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (name: string) => {
    const token = `{{${name}}}`;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(name);
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1500);
    } catch {
      // A clipboard the browser won't give us is not worth an error dialog —
      // the token is written on the button either way.
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="text-sm font-medium">
          Merge fields — click one to copy
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
          {Object.entries(MAILING_VARIABLES).map(([name, description]) => (
            <button
              key={name}
              type="button"
              onClick={() => copy(name)}
              className="rounded-md border border-border px-3 py-2 text-left transition-colors hover:border-dragon-blue-500"
            >
              <code className="text-xs font-semibold text-dragon-blue-500">
                {copied === name ? "Copied!" : `{{${name}}}`}
              </code>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
