import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import {
  canAccessEventPlans,
  getCurrentSchoolId,
  isPtaBoard,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { todayDateOnly } from "@/lib/date-only";
import { getEventDirectory } from "@/actions/event-directory";
import { getEventDirectorySettings } from "@/lib/event-directory-settings";
import {
  comingUpNext,
  parseDirectoryView,
} from "@/lib/event-directory-shared";
import { EventDirectoryBrowser } from "@/components/events/event-directory-browser";
import { EventDirectoryCard } from "@/components/events/event-directory-card";

export const metadata = { title: "Our Events" };

interface OurEventsPageProps {
  searchParams: Promise<{ view?: string; category?: string; q?: string }>;
}

/**
 * Our Events — the school's front window.
 *
 * Every other page in this app is a tool. This one is the window: what the PTA
 * runs, what each event actually is, and how to raise a hand. It is open to
 * every approved member, which is the whole change — the board has been
 * maintaining this catalog for years and no parent has ever seen it.
 */
export default async function OurEventsPage({
  searchParams,
}: OurEventsPageProps) {
  const { view, category, q } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const [school, schoolYear, settings, isBoardMember, canSeePlans] =
    await Promise.all([
      db.query.schools.findFirst({
        where: eq(schools.id, schoolId),
        columns: { name: true },
      }),
      getSchoolCurrentYear(schoolId),
      getEventDirectorySettings(schoolId),
      isPtaBoard(userId),
      canAccessEventPlans(userId, schoolId),
    ]);

  const { entries, stats } = await getEventDirectory();

  // "Today" in the *school's* zone, never the server's. On Vercel a Denver
  // school is already tomorrow from 6pm onward, which would quietly drop an
  // event off "Coming up next" an evening early.
  const today = todayDateOnly(await getSchoolTimeZone(schoolId));
  const upcoming = comingUpNext(entries, today);

  const handsUpLabel = `${stats.handsUp} ${
    stats.handsUp === 1 ? "hand" : "hands"
  } up this year`;

  return (
    <div className="space-y-6">
      <header className="from-dragon-blue-500/10 border-border rounded-lg border bg-gradient-to-br to-transparent p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <PartyPopper className="text-dragon-blue-500 h-4 w-4" />
              {school?.name ?? "Our school"} · {schoolYear}
            </div>
            <h1 className="mt-1 text-2xl font-bold">Our Events</h1>
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">
              Everything the PTA runs this year. Cheer for the ones you love,
              and raise a hand for the ones you&rsquo;d help with.
            </p>
          </div>
          {/* The way in for the people who need it. The Event Plans tab left
              the sidebar; one front door with a way in beats two tabs, one of
              which 404s for most of the school.

              A button rather than a text link, because for a board member or an
              event's team this page is a hallway and the planning workspace is
              where they were actually going. Each card carries its own "Open
              the plan" as well — this is the way to *all* of them. */}
          {canSeePlans && (
            <Link href="/events/plans" className="shrink-0">
              <Button variant="outline">
                <ClipboardList className="h-4 w-4" />
                Event plans
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>

        {entries.length > 0 && (
          <p className="mt-4 text-sm font-medium">
            {stats.events} {stats.events === 1 ? "event" : "events"}
            {settings.reactionsEnabled && stats.reactions > 0 && (
              <> · {stats.reactions} cheers</>
            )}
            {stats.handsUp > 0 && (
              <>
                {" "}
                ·{" "}
                {/* For the board this number is a to-do list, so it goes
                    somewhere. It used to be a dead end, and the natural guess —
                    Help Requests — is a different table that says nobody is
                    waiting. For everyone else it stays a fact about the school. */}
                {isBoardMember ? (
                  <Link
                    href="/admin/board/raised-hands"
                    className="underline underline-offset-2"
                  >
                    {handsUpLabel}
                  </Link>
                ) : (
                  handsUpLabel
                )}
              </>
            )}
          </p>
        )}
      </header>

      {entries.length === 0 ? (
        <EmptyDirectory isBoardMember={isBoardMember} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
                <CalendarDays className="text-dragon-blue-500 h-5 w-5" />
                Coming up next
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((entry) => (
                  <EventDirectoryCard
                    key={entry.id}
                    entry={entry}
                    reactionsEnabled={settings.reactionsEnabled}
                    customEmojiEnabled={settings.customEmojiEnabled}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-lg font-semibold">All our events</h2>
            <EventDirectoryBrowser
              entries={entries}
              initialView={parseDirectoryView(view)}
              initialCategory={category ?? ""}
              initialQuery={q ?? ""}
              reactionsEnabled={settings.reactionsEnabled}
              customEmojiEnabled={settings.customEmojiEnabled}
            />
          </section>
        </>
      )}
    </div>
  );
}

/** Nobody gets a blank page — the board gets the way to fix it. */
function EmptyDirectory({ isBoardMember }: { isBoardMember: boolean }) {
  return (
    <div className="border-border bg-card flex flex-col items-center rounded-lg border border-dashed p-10 text-center">
      <PartyPopper className="text-muted-foreground mb-3 h-10 w-10" />
      <h2 className="text-lg font-semibold">
        Our event guide is being written
      </h2>
      <p className="text-muted-foreground mt-1 max-w-prose text-sm">
        The PTA is putting together the list of everything it runs this year.
        Check back soon — this is where you&rsquo;ll be able to raise a hand.
      </p>
      {isBoardMember && (
        <Link
          href="/admin/board/event-catalog"
          className="text-dragon-blue-600 dark:text-dragon-blue-400 mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          Add your recurring events
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
