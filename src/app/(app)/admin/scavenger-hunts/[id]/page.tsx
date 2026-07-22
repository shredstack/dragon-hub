import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getHuntDetail, getHuntResults } from "@/actions/scavenger-hunts";
import { HuntSettings } from "./hunt-settings";
import { HuntQrSection } from "./hunt-qr-section";
import { ItemEditor } from "./item-editor";
import { HuntResults } from "./hunt-results";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HuntDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const { id } = await params;

  let detail;
  try {
    detail = await getHuntDetail(id);
  } catch {
    notFound();
  }

  const results = await getHuntResults(id);
  const { hunt, huntUrl, qrDataUrl } = detail;
  const liveItems = hunt.items.filter((i) => !i.archivedAt);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/scavenger-hunts"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All hunts
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{hunt.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hunt.schoolYear} · {liveItems.length} item
          {liveItems.length === 1 ? "" : "s"} · {results.playerCount} playing ·{" "}
          {results.finisherCount} finished
        </p>
      </div>

      <HuntSettings hunt={hunt} />

      <ItemEditor huntId={hunt.id} items={hunt.items} />

      <HuntQrSection
        huntId={hunt.id}
        huntTitle={hunt.title}
        qrCode={hunt.qrCode}
        qrDataUrl={qrDataUrl}
        huntUrl={huntUrl}
        status={hunt.status}
        itemCount={liveItems.length}
      />

      <HuntResults huntId={hunt.id} results={results} />
    </div>
  );
}
