import { Mail } from "lucide-react";

import { leadTypeLabel, type DirectoryLead } from "@/lib/event-directory-shared";
import { cn } from "@/lib/utils";

/**
 * Who is running this event this year, with a way to write to them.
 *
 * "Who do I ask about the Fun Run?" is the question a parent opens Our Events
 * with, and until this existed the page couldn't answer it: react, raise a hand
 * and ask to join all route *into* the board's queue, and none of them let
 * somebody ask a question first.
 *
 * The board lead is named as such deliberately — a parent offering to help wants
 * the person who owns the event on the board's behalf, not whoever happens to
 * sort first alphabetically. `projectLead` on the server has already dropped the
 * addresses if the school turned `showLeadContact` off, so the names and the
 * titles still render and the mailto link simply isn't there.
 *
 * No "use client": it renders from both the server detail page and the client
 * card, and holds no state of its own.
 */
export function EventLeads({
  leads,
  className,
  compact = false,
}: {
  leads: DirectoryLead[];
  className?: string;
  /** Card-sized: one line per lead, no lead-in label. */
  compact?: boolean;
}) {
  if (leads.length === 0) return null;

  return (
    <ul className={cn("space-y-0.5", className)}>
      {leads.map((lead, index) => {
        const title = leadTypeLabel(lead.leadType);
        return (
          <li
            key={lead.email ?? `${lead.name}-${index}`}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
          >
            <span className="text-foreground font-medium">
              {index === 0 && !compact ? `Led by ${lead.name}` : lead.name}
            </span>
            {title && <span>· {title}</span>}
            {lead.email && (
              // `relative z-10` so this still works on the card, where a
              // stretched link covers the whole surface — a tap on the address
              // must open a mail app, not the event page underneath it.
              <a
                href={`mailto:${lead.email}`}
                className="text-dragon-blue-600 dark:text-dragon-blue-400 relative z-10 inline-flex items-center gap-1 hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                {compact ? "Email" : lead.email}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
