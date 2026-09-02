"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonBadges } from "@/components/ui/person-badges";
import { EventIcon } from "@/components/events/event-icon";
import type {
  RaisedHandPerson,
  RaisedHandsGroup,
} from "@/actions/event-directory";

/**
 * The board's roster of raised hands, grouped by event.
 *
 * A read surface with one action, and that action is a clipboard: the next step
 * after reading this list is emailing four people, not approving them. Anything
 * that granted access from here would quietly turn a hand-raise into the
 * request it deliberately isn't.
 */
export function RaisedHandsRoster({ groups }: { groups: RaisedHandsGroup[] }) {
  const inWindow = groups.filter((g) => g.inDirectory);
  const retired = groups.filter((g) => !g.inDirectory);

  return (
    <div className="space-y-8">
      {inWindow.map((group) => (
        <EventGroup key={group.eventCatalogId} group={group} />
      ))}

      {retired.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Not in Our Events</h2>
            <p className="text-muted-foreground text-sm">
              These events are retired or hidden from families, so their hands
              aren&rsquo;t in the count above. The people are still here.
            </p>
          </div>
          {retired.map((group) => (
            <EventGroup key={group.eventCatalogId} group={group} />
          ))}
        </section>
      )}
    </div>
  );
}

function EventGroup({ group }: { group: RaisedHandsGroup }) {
  const [copied, setCopied] = useState(false);

  // The whole point of the list is the email that follows it, so make that one
  // click rather than a scroll and a lot of selecting.
  const copyEmails = () => {
    const emails = group.people
      .map((p) => p.email)
      .filter(Boolean)
      .join(", ");
    if (!emails) return;
    navigator.clipboard.writeText(emails);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="border-border bg-card space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <EventIcon
            iconEmoji={group.iconEmoji}
            imageUrl={group.imageUrl}
            className="h-10 w-10"
          />
          <div>
            <h3 className="font-semibold">
              <Link href={`/events/${group.slug}`} className="hover:underline">
                {group.title}
              </Link>
            </h3>
            <p className="text-muted-foreground text-sm">
              {group.people.length}{" "}
              {group.people.length === 1 ? "person" : "people"}
              {group.people.length !== group.handsUp && (
                <> · {group.handsUp} counted in the hero</>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {group.eventPlanId && (
            <Link
              href={`/events/plans/${group.eventPlanId}`}
              className="text-dragon-blue-600 dark:text-dragon-blue-400 text-sm hover:underline"
            >
              Open the plan
            </Link>
          )}
          <Button size="sm" variant="outline" onClick={copyEmails}>
            {copied ? "Copied!" : "Copy emails"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {group.people.map((person) => (
          <PersonRow key={person.key} person={person} />
        ))}
      </div>
    </section>
  );
}

function PersonRow({ person }: { person: RaisedHandPerson }) {
  const fromCampaign = person.sources.includes("campaign");
  const fromApp = person.sources.includes("our_events");

  return (
    <div className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{person.name}</span>
          <PersonBadges badges={person.badges} />
        </div>
        <div className="text-muted-foreground mt-1 space-y-0.5 text-sm">
          <div className="break-all">{person.email}</div>
          {person.phone && <div>{person.phone}</div>}
          {person.notes && <div className="italic">&ldquo;{person.notes}&rdquo;</div>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1">
        {person.isLead ? (
          <Badge variant="success">Would lead</Badge>
        ) : (
          <Badge variant="secondary">Would help</Badge>
        )}
        {/* Where they said it. A parent who scanned the flyer in September and
            raised a hand in February is one person with both. */}
        {fromCampaign && (
          <Badge variant="outline">
            {fromApp ? "Also from a campaign" : "From a campaign"}
          </Badge>
        )}
        {person.onTeam && <Badge variant="outline">Already on the team</Badge>}
      </div>
    </div>
  );
}
