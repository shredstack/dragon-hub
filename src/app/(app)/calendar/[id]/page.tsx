import { db } from "@/lib/db";
import { calendarEvents, schoolCalendarIntegrations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import {
  MapPin,
  Calendar,
  Clock,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import {
  getCurrentSchoolId,
  getCurrentUser,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { FlyerGallery } from "@/components/calendar/flyer-gallery";
import { EventEnhancementDialog } from "@/components/calendar/event-enhancement-dialog";

const typeColors: Record<string, string> = {
  classroom: "bg-dragon-blue-100 text-dragon-blue-700",
  pta: "bg-dragon-gold-100 text-dragon-gold-700",
  school: "bg-muted text-muted-foreground",
};

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  const schoolId = await getCurrentSchoolId();
  const user = await getCurrentUser();

  // No school resolved means no school-scoped data. Falling back to an
  // unfiltered lookup would turn a missing cookie into "any event, any school".
  if (!schoolId) notFound();

  // Fetch event with flyers
  const event = await db.query.calendarEvents.findFirst({
    where: and(
      eq(calendarEvents.id, id),
      eq(calendarEvents.schoolId, schoolId)
    ),
    with: {
      flyers: {
        orderBy: (flyers, { asc }) => [asc(flyers.sortOrder)],
      },
      ptaDescriptionUpdater: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!event) {
    notFound();
  }

  // The same meeting synced from multiple Google calendars arrives as separate
  // rows, each with its own id and its own enhancements (a board member may
  // attach a flyer to one copy and PTA notes to another). The calendar list
  // (src/app/(app)/calendar/page.tsx) collapses these into one card and merges
  // their flyers/notes, so a card that says "1 flyer" can link to whichever
  // copy was picked as survivor. Merge the duplicate copies' enhancements here
  // too, keyed the same way as the list, so a badge shown there is always
  // backed by data at this URL.
  const dedupeKey = (title: string, startTime: Date) =>
    `${title.trim().toLowerCase()}|${new Date(startTime).getTime()}`;
  const eventKey = dedupeKey(event.title, event.startTime);

  const sameTimeEvents = await db.query.calendarEvents.findMany({
    where: eq(calendarEvents.startTime, event.startTime),
    with: {
      flyers: {
        orderBy: (flyers, { asc }) => [asc(flyers.sortOrder)],
      },
      ptaDescriptionUpdater: {
        columns: { id: true, name: true },
      },
    },
  });

  // Duplicate copies of this meeting: same school + same dedupe key. Includes
  // the primary event itself.
  const copies = sameTimeEvents.filter(
    (e) =>
      e.schoolId === event.schoolId &&
      dedupeKey(e.title, e.startTime) === eventKey
  );

  // Union flyers across copies — each flyer id is unique and delete/download
  // work by flyer id regardless of which copy it hangs off.
  const mergedFlyers = copies
    .flatMap((e) => e.flyers)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Prefer this row's own PTA notes; otherwise surface a sibling copy's.
  const noteSource = event.ptaDescription
    ? event
    : copies.find((e) => e.ptaDescription) ?? event;
  const mergedPtaDescription = noteSource.ptaDescription;
  const mergedPtaUpdater = noteSource.ptaDescriptionUpdater;

  // Get calendar name if available
  let calendarName: string | null = null;
  if (event.calendarSource && schoolId) {
    const integration = await db.query.schoolCalendarIntegrations.findFirst({
      where: and(
        eq(schoolCalendarIntegrations.calendarId, event.calendarSource),
        eq(schoolCalendarIntegrations.schoolId, schoolId)
      ),
    });
    calendarName = integration?.name ?? null;
  }

  // Check if user can edit (PTA board or admin)
  const canEdit =
    user?.id && schoolId
      ? await isPtaBoardMember(user.id, schoolId)
      : false;

  // Format dates
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;

  // Check if multi-day event
  const isMultiDay =
    endDate &&
    startDate.toDateString() !== endDate.toDateString();

  return (
    <div>
      {/* Back link */}
      <Link
        href="/calendar"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Calendar
      </Link>

      {/* Event header */}
      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{event.title}</h1>
              {event.eventType && (
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${typeColors[event.eventType] ?? typeColors.school}`}
                >
                  {event.eventType}
                </span>
              )}
            </div>

            {/* Date and time */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {isMultiDay
                    ? `${startDate.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })} - ${endDate.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}`
                    : startDate.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {startDate.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {endDate &&
                    !isMultiDay &&
                    ` - ${endDate.toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`}
                </span>
              </div>
              {event.location && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{event.location}</span>
                </div>
              )}
            </div>

            {calendarName && (
              <p className="mt-3 text-sm text-muted-foreground">
                From calendar: {calendarName}
              </p>
            )}
          </div>

          {canEdit && (
            <EventEnhancementDialog
              eventId={event.id}
              currentDescription={mergedPtaDescription}
              flyers={mergedFlyers}
            />
          )}
        </div>
      </div>

      {/* Google Calendar description */}
      {event.description && (
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-3 font-semibold">Description</h2>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {event.description}
          </p>
        </div>
      )}

      {/* PTA enhanced description */}
      {mergedPtaDescription && (
        <div className="mb-6 rounded-lg border border-dragon-gold-200 bg-dragon-gold-50 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-dragon-gold-900">PTA Notes</h2>
            {mergedPtaUpdater && (
              <span className="text-sm text-dragon-gold-700">
                Updated by {mergedPtaUpdater.name}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-dragon-gold-800">
            {mergedPtaDescription}
          </p>
        </div>
      )}

      {/* Flyers */}
      {mergedFlyers.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Flyers & Attachments</h2>
          <FlyerGallery flyers={mergedFlyers} canDelete={canEdit} />
        </div>
      )}

      {/* Google Calendar link */}
      {event.googleEventId && (
        <div className="text-center">
          <a
            href={`https://calendar.google.com/calendar/event?eid=${encodeURIComponent(event.googleEventId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View in Google Calendar
          </a>
        </div>
      )}
    </div>
  );
}
