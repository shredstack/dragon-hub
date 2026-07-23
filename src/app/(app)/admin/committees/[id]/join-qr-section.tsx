"use client";

import { regenerateCommitteeJoinCode } from "@/actions/committees";
import { QrCodeCard } from "@/components/volunteer/qr-code-card";

interface Props {
  committeeId: string;
  committeeName: string;
  joinCode: string;
  joinUrl: string;
  qrDataUrl: string | null;
  /** Draft and closed committees have a link that deliberately 404s. */
  isLive: boolean;
}

export function JoinQrSection({
  committeeId,
  committeeName,
  joinCode,
  joinUrl,
  qrDataUrl,
  isLive,
}: Props) {
  return (
    <QrCodeCard
      title="Join link & QR code"
      blurb="Print it for Back to School Night or paste the link into a newsletter. Signing up puts a parent on the roster immediately — no admin step."
      qrCode={joinCode}
      qrDataUrl={qrDataUrl}
      signupUrl={joinUrl}
      downloadName={committeeName}
      onRegenerate={() => regenerateCommitteeJoinCode(committeeId)}
    >
      {!isLive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This committee isn&apos;t active, so the link above shows a
          &ldquo;not found&rdquo; page. Set its status to <strong>Active</strong>{" "}
          before handing it out.
        </div>
      )}
    </QrCodeCard>
  );
}
