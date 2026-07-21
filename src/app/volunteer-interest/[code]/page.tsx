import { getPublicCampaign } from "@/actions/volunteer-campaigns";
import { notFound } from "next/navigation";
import { InterestForm } from "./interest-form";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function VolunteerInterestPage({ params }: PageProps) {
  const { code } = await params;
  const campaign = await getPublicCampaign(code);

  if (!campaign) {
    notFound();
  }

  return (
    <div className="min-h-dvh bg-muted px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-dragon-blue-500">Dragon Hub</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {campaign.schoolName}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">{campaign.title}</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {campaign.intro ??
                "Tell us which events you might be interested in helping with this year."}
            </p>
          </div>

          {/* Setting expectations up front is what makes people say yes: this
              is a "maybe", not a shift they're locked into. */}
          <div className="mb-6 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            <strong className="text-foreground">This isn&apos;t a commitment.</strong>{" "}
            Checking a box just tells us you&apos;re open to helping so we know
            who to contact. When an event gets close, we&apos;ll email you with
            the specific dates and time slots — you decide then.
          </div>

          <InterestForm
            qrCode={code}
            schoolName={campaign.schoolName}
            campaign={campaign}
          />
        </div>

        {campaign.contactEmail && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Questions?{" "}
            <a
              href={`mailto:${campaign.contactEmail}`}
              className="underline hover:text-foreground"
            >
              {campaign.contactEmail}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
