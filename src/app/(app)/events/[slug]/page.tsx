import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Clock,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { getEventDirectoryEntry } from "@/actions/event-directory";
import { getEventDirectorySettings } from "@/lib/event-directory-settings";
import { eventTimingLine } from "@/lib/event-directory-shared";
import { EventIcon } from "@/components/events/event-icon";
import { EventReactionBar } from "@/components/events/event-reaction-bar";
import { EventHandRaise } from "@/components/events/event-hand-raise";
import { EventJoinPanel } from "@/components/events/event-join-panel";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EVENT_CATEGORIES } from "@/lib/constants";
import { formatWeekdayDateOnly } from "@/lib/date-only";
import { privateMetadata } from "@/lib/page-metadata";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EventDirectoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  // The title would name an event at one school, so it stays private for the
  // same reason every other in-app page's does.
  return privateMetadata("Event");
}

/**
 * One event's page, in the school's front window.
 *
 * Next.js allows one dynamic segment per level and `/events/[id]` — a plan
 * UUID — was already there. That URL is stored in historical
 * `notifications.url` rows and in every email this app has ever sent, so the
 * catalog page takes `[slug]` and hands a UUID straight back to where plans
 * live now. Catalog slugs are `slugify()`d titles and unique per school, so
 * they can never collide with a UUID.
 */
export default async function EventDirectoryPage({
  params,
}: EventDirectoryPageProps) {
  const { slug } = await params;

  // Historical notification and email links point at /events/<uuid>. The plan
  // list moved but the plan itself did not, so a UUID here is a plan link that
  // predates this page — hand it back to where plans live now.
  if (UUID_RE.test(slug)) redirect(`/events/plans/${slug}`);

  const session = await auth();
  if (!session?.user?.id) return null;
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [entry, settings] = await Promise.all([
    getEventDirectoryEntry(slug),
    getEventDirectorySettings(schoolId),
  ]);
  if (!entry) notFound();

  const timing = eventTimingLine(entry);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/events"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" />
        Our Events
      </Link>

      {entry.imageUrl && (
        <div className="border-border relative h-40 w-full overflow-hidden rounded-lg border sm:h-56">
          {/* unoptimized: a Vercel Blob a board member chose, not worth a
              transform per size — same call the EventIcon makes. */}
          <Image
            src={entry.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
            unoptimized
          />
        </div>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <EventIcon
            iconEmoji={entry.iconEmoji}
            imageUrl={entry.imageUrl}
            className="h-14 w-14 text-3xl"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{entry.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <CategoryBadge set={EVENT_CATEGORIES} value={entry.category} />
              {timing && (
                <span className="text-muted-foreground text-sm">{timing}</span>
              )}
            </div>
          </div>
        </div>

        {/* Our Events is the front door for the whole school now, which left
            the people who actually run the event one unlabelled hop from the
            tool they came for. `canOpenPlan` is decided on the server — board,
            school leadership, or someone already on this team — so this is a
            real door and never a link that 404s. */}
        {entry.plan?.canOpenPlan && (
          <Link href={`/events/plans/${entry.plan.id}`} className="shrink-0">
            <Button>
              <ClipboardList className="h-4 w-4" />
              Open the plan
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </header>

      {settings.reactionsEnabled && (
        <section className="space-y-2">
          <EventReactionBar
            eventCatalogId={entry.id}
            reactions={entry.reactions}
            customEmojiEnabled={settings.customEmojiEnabled}
            reactorNames={entry.reactorNames}
            size="lg"
          />
          {/* Names only when the school turned them on — and they aren't in
              the payload at all otherwise, so this can't leak by CSS. */}
          {entry.reactorNames && (
            <ReactorNames names={entry.reactorNames} />
          )}
        </section>
      )}

      {entry.description && (
        <section>
          <p className="whitespace-pre-line">{entry.description}</p>
        </section>
      )}

      {entry.volunteerResponsibilities && (
        <Section title="What you'd actually be doing">
          <p className="whitespace-pre-line">
            {entry.volunteerResponsibilities}
          </p>
        </Section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {entry.timeCommitment && (
          <Fact icon={<Clock className="h-4 w-4" />} label="Typical time commitment">
            {entry.timeCommitment}
          </Fact>
        )}
        {entry.estimatedVolunteers && (
          <Fact icon={<Users className="h-4 w-4" />} label="Usually takes">
            {entry.estimatedVolunteers}
          </Fact>
        )}
        {timing && (
          <Fact
            icon={<CalendarDays className="h-4 w-4" />}
            label="When it happens"
          >
            {timing}
          </Fact>
        )}
      </div>

      <Section title="This year">
        {entry.plan?.planningStarted ? (
          <div className="space-y-1 text-sm">
            <p>
              {entry.plan.eventDate
                ? formatWeekdayDateOnly(entry.plan.eventDate)
                : "Planning has started."}
            </p>
            {entry.plan.leadNames.length > 0 && (
              <p className="text-muted-foreground">
                Led by {entry.plan.leadNames.join(", ")}
              </p>
            )}
            {entry.plan.canOpenPlan && (
              <Link
                href={`/events/plans/${entry.plan.id}`}
                className="text-dragon-blue-600 dark:text-dragon-blue-400 inline-flex items-center gap-1 pt-1 font-medium hover:underline"
              >
                Tasks, team, budget and discussion
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Not scheduled yet.</p>
        )}
      </Section>

      <Section title="Interested?">
        <EventHandRaise
          eventCatalogId={entry.id}
          interest={entry.myInterest}
          note={entry.myInterestNote}
          showNote
        />
      </Section>

      <EventJoinPanel
        eventCatalogId={entry.id}
        eventTitle={entry.title}
        capacity={entry.capacity}
        request={entry.myRequest}
        onTeam={entry.onTeam}
        planId={entry.plan?.id ?? null}
        planningStarted={entry.plan?.planningStarted ?? false}
      />

      {entry.tags && entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-lg border p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

function ReactorNames({ names }: { names: Record<string, string[]> }) {
  const entries = Object.entries(names).filter(([, list]) => list.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="text-muted-foreground space-y-0.5 text-xs">
      {entries.map(([reaction, list]) => (
        <p key={reaction}>
          <span aria-hidden>{reaction}</span> {formatNames(list)}
        </p>
      ))}
    </div>
  );
}

/** "Amy, Sarah and 12 others" — warm at three names, unreadable at forty. */
function formatNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  const rest = names.length - 2;
  return `${names.slice(0, 2).join(", ")} and ${rest} others`;
}
