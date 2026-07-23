import { notFound } from "next/navigation";
import Image from "next/image";
import { getPublicCommittee } from "@/actions/committees";
import { MissionNote } from "@/components/volunteer/mission-note";
import { CommitteeJoinForm } from "./join-form";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function CommitteeJoinPage({ params }: PageProps) {
  const { code } = await params;
  const committee = await getPublicCommittee(code);

  // Draft, closed, archived, or outside the opens/closes window all land here.
  if (!committee) notFound();

  return (
    <div className="min-h-dvh bg-muted px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {committee.schoolName}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            {committee.iconEmoji && (
              <span className="mr-2">{committee.iconEmoji}</span>
            )}
            {committee.name}
          </h1>
        </header>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {committee.imageUrl && (
            <div className="relative mb-4 h-40 w-full overflow-hidden rounded-lg bg-muted">
              <Image
                src={committee.imageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 600px"
                unoptimized
              />
            </div>
          )}

          {committee.description && (
            <p className="text-muted-foreground">{committee.description}</p>
          )}

          {(committee.typicalTiming || committee.timeCommitment) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {committee.typicalTiming && <span>📅 {committee.typicalTiming}</span>}
              {committee.timeCommitment && <span>⏱ {committee.timeCommitment}</span>}
            </div>
          )}

          {committee.responsibilities && (
            <div className="mt-4 rounded-lg bg-muted/60 p-4">
              <h2 className="text-sm font-semibold">What you&apos;d be doing</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {committee.responsibilities}
              </p>
            </div>
          )}

          <div className="mt-6 border-t border-border pt-6">
            <CommitteeJoinForm joinCode={code} committee={committee} />
          </div>
        </div>

        <MissionNote />
      </div>
    </div>
  );
}
