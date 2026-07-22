"use client";

import { regenerateHuntQrCode } from "@/actions/scavenger-hunts";
import { QrCodeCard } from "@/components/volunteer/qr-code-card";

interface Props {
  huntId: string;
  huntTitle: string;
  qrCode: string;
  qrDataUrl: string | null;
  huntUrl: string;
  status: string;
  itemCount: number;
}

export function HuntQrSection({
  huntId,
  huntTitle,
  qrCode,
  qrDataUrl,
  huntUrl,
  status,
  itemCount,
}: Props) {
  // The QR always resolves, but the page behind it 404s until the hunt is
  // playable — worth saying before someone prints the table tents.
  const notLive =
    status !== "active"
      ? "This hunt is not active yet, so the link shows a “hunt closed” page. Set the status to Active to open it."
      : itemCount === 0
        ? "This hunt has no items yet, so the link shows a “hunt closed” page. Add at least one item."
        : null;

  return (
    <div className="space-y-3">
      {notLive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ {notLive}
        </div>
      )}

      <QrCodeCard
        title="Hunt QR Code"
        blurb="Print this for the welcome table and the table tents. Families scan it, get a handle, and start checking things off — no sign-in, no app to download."
        qrCode={qrCode}
        qrDataUrl={qrDataUrl}
        signupUrl={huntUrl}
        downloadName={huntTitle}
        onRegenerate={() => regenerateHuntQrCode(huntId)}
      >
        <div>
          <h3 className="font-medium">Ideas for getting scans</h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Poster at the welcome table, where the paper lists used to go</li>
            <li>Table tents at every booth families are supposed to visit</li>
            <li>On the slide loop in the cafeteria or gym</li>
            <li>In the reminder email that goes out the morning of the event</li>
          </ul>
        </div>
      </QrCodeCard>
    </div>
  );
}
