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
  isSchoolPtaBoardOrAdmin,
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

  // Fetch event with flyers
  const event = await db.query.calendarEvents.findFirst({
    where: schoolId
      ? and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.schoolId, schoolId)
        )
      : eq(calendarEvents.id, id),
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
      ? await isSchoolPtaBoardOrAdmin(user.id, schoolId)
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
              currentDescription={event.ptaDescription}
              flyers={event.flyers}
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
      {event.ptaDescription && (
        <div className="mb-6 rounded-lg border border-dragon-gold-200 bg-dragon-gold-50 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-dragon-gold-900">PTA Notes</h2>
            {event.ptaDescriptionUpdater && (
              <span className="text-sm text-dragon-gold-700">
                Updated by {event.ptaDescriptionUpdater.name}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-dragon-gold-800">
            {event.ptaDescription}
          </p>
        </div>
      )}

      {/* Flyers */}
      {event.flyers.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Flyers & Attachments</h2>
          <FlyerGallery flyers={event.flyers} canDelete={canEdit} />
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
