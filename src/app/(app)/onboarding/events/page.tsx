import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getCatalog } from "@/actions/event-catalog";
import { EventCatalogList } from "@/components/onboarding/event-catalog-list";
import { Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function EventsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const catalog = await getCatalog();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/onboarding"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Onboarding
        </Link>
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

      {/* Event Catalog List */}
      <EventCatalogList initialCatalog={catalog} />
    </div>
  );
}
