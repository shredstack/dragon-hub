"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { PersonBadges } from "@/components/ui/person-badges";
import {
  getEventInterestRoster,
  type EventInterestRoster,
  type InterestRosterPerson,
} from "@/actions/event-directory";

/**
 * Who cares about this event — the board's side of Our Events, on the catalog
 * entry itself.
 *
 * Three signals, kept apart because they mean three different things: a
 * reaction is one tap with no obligation, a raised hand is intent, and a
 * request is someone asking for access and waiting on an answer. Flattening
 * them into one "interested" count would lose exactly the distinction the
 * board needs to act on.
 *
 * Loaded on expand rather than with the page: a twenty-event catalog would
 * otherwise run twenty rosters nobody opened.
 */
export function EventInterestPanel({
  eventCatalogId,
  slug,
}: {
  eventCatalogId: string;
  slug: string;
}) {
  const [roster, setRoster] = useState<EventInterestRoster | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEventInterestRoster(eventCatalogId)
      .then((result) => {
        if (!cancelled) setRoster(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load this.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [eventCatalogId]);

  if (error) {
    return <p className="text-muted-foreground text-sm">{error}</p>;
  }

  if (!roster) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading who&rsquo;s interested…
      </p>
    );
  }

  const pendingRequests = roster.requests.filter(
    (r) => r.status === "pending" || r.status === "waitlisted"
  );
  const nothing =
    roster.reactions.length === 0 &&
    roster.leads.length === 0 &&
    roster.helpers.length === 0 &&
    roster.observers.length === 0 &&
    roster.requests.length === 0 &&
    roster.fromCampaigns.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Our Events</p>
        <Link
          href={`/events/${slug}`}
          className="text-dragon-blue-600 dark:text-dragon-blue-400 text-xs hover:underline"
        >
          See it the way families do
        </Link>
      </div>

      {nothing ? (
        <p className="text-muted-foreground text-sm">
          Nobody has reacted or raised a hand for this one yet.
        </p>
      ) : (
        <>
          {roster.reactions.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Reactions</p>
              <div className="flex flex-wrap gap-2">
                {roster.reactions.map((r) => (
                  <span
                    key={r.reaction}
                    className="border-border inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
                    title={r.names.join(", ")}
                  >
                    <span aria-hidden>{r.reaction}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <PeopleList
            label="Would lead"
            people={roster.leads}
            empty="Nobody yet."
          />
          <PeopleList
            label="Would help"
            people={roster.helpers}
            empty="Nobody yet."
          />
          {roster.observers.length > 0 && (
            <PeopleList
              label="Would observe"
              people={roster.observers}
              empty=""
            />
          )}

          {pendingRequests.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                Asked to join the planning team
              </p>
              <ul className="space-y-1 text-sm">
                {pendingRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span>{r.name}</span>
                    <PersonBadges badges={r.badges} />
                    <span className="text-muted-foreground text-xs">
                      {r.status === "waitlisted" ? "in line" : "waiting"}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/admin/board/event-requests"
                className="text-dragon-blue-600 dark:text-dragon-blue-400 mt-1 inline-block text-xs hover:underline"
              >
                Answer these
              </Link>
            </div>
          )}

          {/* The other door. A QR flyer at Back to School Night captures the
              same intent from people who may have no account at all, so the
              board never has to ask "did anyone volunteer for this?" twice. */}
          {roster.fromCampaigns.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                From volunteer campaigns
              </p>
              <ul className="space-y-1 text-sm">
                {roster.fromCampaigns.map((person) => (
                  <li
                    key={person.email}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span>{person.name}</span>
                    <span className="text-muted-foreground text-xs break-all">
                      {person.email}
                    </span>
                    {person.alsoInApp && (
                      <span className="text-muted-foreground text-xs">
                        also raised a hand here
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PeopleList({
  label,
  people,
  empty,
}: {
  label: string;
  people: InterestRosterPerson[];
  empty: string;
}) {
  if (people.length === 0 && !empty) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {people.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {people.map((person) => (
            <li
              key={person.userId}
              className="flex flex-wrap items-center gap-2"
            >
              <span>{person.name}</span>
              <PersonBadges badges={person.badges} />
              {person.notes && (
                <span className="text-muted-foreground text-xs italic">
                  “{person.notes}”
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
