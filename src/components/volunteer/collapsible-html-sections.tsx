"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { splitHtmlByHeadings } from "@/lib/signup-page-content";

/**
 * Render board-authored HTML with each heading collapsed into a disclosure.
 *
 * Used for the sign-up page's intro and role descriptions, where a thorough VP
 * writes several paragraphs per role and pushes the form itself off the screen.
 * Collapsed-by-default keeps the page a list of choices; a parent expands the
 * one role they're weighing.
 *
 * Copy with no headings renders exactly as before — nothing to fold.
 *
 * `html` must already be sanitized (resolveSignupPageContent on the public page,
 * the editor's own sanitized output in the preview).
 */
interface Props {
  html: string;
  className?: string;
}

export function CollapsibleHtmlSections({ html, className }: Props) {
  const baseId = useId();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { leadHtml, sections } = splitHtmlByHeadings(html);

  if (sections.length === 0) {
    return (
      <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
    );
  }

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className={className}>
      {leadHtml && <div dangerouslySetInnerHTML={{ __html: leadHtml }} />}

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background/60">
        {sections.map((section) => {
          const isOpen = expanded[section.key] ?? false;
          const panelId = `${baseId}-${section.key}`;

          return (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => toggle(section.key)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                // Empty sections still toggle rather than being disabled — a
                // heading with nothing under it is a typo, not a mode.
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <span
                  className="font-semibold text-foreground"
                  dangerouslySetInnerHTML={{ __html: section.headingHtml }}
                />
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <div
                  id={panelId}
                  // The body's own tags carry .meeting-notes bottom margins;
                  // drop the last one so the padding isn't doubled.
                  className="px-3 pb-3 pt-0 [&>*:last-child]:mb-0"
                  dangerouslySetInnerHTML={{ __html: section.bodyHtml }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
