"use client";

import { regenerateCampaignQrCode } from "@/actions/volunteer-campaigns";
import { QrCodeCard } from "@/components/volunteer/qr-code-card";

interface Props {
  campaignId: string;
  campaignTitle: string;
  qrCode: string;
  qrDataUrl: string | null;
  signupUrl: string;
  status: string;
  eventCount: number;
}

export function CampaignQrSection({
  campaignId,
  campaignTitle,
  qrCode,
  qrDataUrl,
  signupUrl,
  status,
  eventCount,
}: Props) {
  // The QR always resolves, but the page behind it 404s until the campaign is
  // publishable — worth saying before someone prints 300 flyers.
  const notLive =
    status !== "active"
      ? "This campaign is not active yet, so the link shows a “sign-up closed” page. Set the status to Active to open it."
      : eventCount === 0
        ? "This campaign has no events yet, so the link shows a “sign-up closed” page. Add at least one event."
        : null;

  return (
    <div className="space-y-3">
      {notLive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ {notLive}
        </div>
      )}

      <QrCodeCard
        title="Campaign QR Code"
        blurb="Print this on a flyer or poster, or put it on a table at Back to School Night. Parents scan it, check the events they're open to helping with, and you get their contact info."
        qrCode={qrCode}
        qrDataUrl={qrDataUrl}
        signupUrl={signupUrl}
        downloadName={campaignTitle}
        onRegenerate={() => regenerateCampaignQrCode(campaignId)}
      >
        <div>
          <h3 className="font-medium">Ideas for getting scans</h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Print it at poster size for the PTA table at Back to School Night</li>
            <li>Put it on the take-home flyer instead of a tear-off slip</li>
            <li>Include the link in the weekly PTA email</li>
            <li>Ask teachers to add it to their classroom newsletter</li>
          </ul>
        </div>
      </QrCodeCard>
    </div>
  );
}
