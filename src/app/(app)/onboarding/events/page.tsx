import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getCatalog } from "@/actions/event-catalog";
import { EventCatalogList } from "@/components/onboarding/event-catalog-list";
import { EventCatalogForm } from "@/components/onboarding/event-catalog-form";
import { getBoardPositionsWithSeed } from "@/lib/board-positions";
import { Calendar } from "lucide-react";
import Link from "next/link";

export default async function EventsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const catalog = await getCatalog();
  const positions = await getBoardPositionsWithSeed(schoolId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Event Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Browse events and express your interest in leading or helping
            </p>
          </div>
        </div>
      </div>

      {/*
        The catalog describes events in general, not this year's run of them,
        so raising a hand here is intent rather than an assignment. Said plainly
        because the two look identical from this page — you pick "I'd like to
        lead", nothing else happens, and it's fair to assume you're now the lead.
      */}
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        These are the school&rsquo;s recurring events. Telling us you&rsquo;d
        like to lead one is a signal to the board, not an assignment — actual
        leads are set for each school year on{" "}
        <Link
          href="/admin/board/event-plan-setup"
          className="font-medium text-dragon-blue-500 underline-offset-2 hover:underline"
        >
          Plan the Year
        </Link>
        , which opens this year&rsquo;s event plan for each event and hands it to
        someone.
      </p>

      {/* Add Event Form */}
      <EventCatalogForm showToggleButton={true} positions={positions} />

      {/* Event Catalog List */}
      <EventCatalogList initialCatalog={catalog} />
    </div>
  );
}
