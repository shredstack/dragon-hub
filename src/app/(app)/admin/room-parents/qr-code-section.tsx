"use client";

import { QrCodeCard } from "@/components/volunteer/qr-code-card";
import {
  generateVolunteerQrCode,
  regenerateVolunteerQrCode,
  type VolunteerSettings,
} from "@/actions/volunteer-signups";

interface Props {
  qrCode: string | null;
  qrDataUrl: string | null | undefined;
  signupUrl: string | undefined;
  schoolName: string;
  settings: VolunteerSettings;
}

export function QrCodeSection({
  qrCode,
  qrDataUrl,
  signupUrl,
  schoolName,
  settings,
}: Props) {
  return (
    <QrCodeCard
      title="Volunteer Sign-up QR Code"
      blurb="Share this QR code with teachers for Back to School Night. Parents can scan it to sign up as room parents or party volunteers."
      qrCode={qrCode}
      qrDataUrl={qrDataUrl}
      signupUrl={signupUrl}
      downloadName={`${schoolName}-volunteer-signup`}
      onGenerate={generateVolunteerQrCode}
      onRegenerate={regenerateVolunteerQrCode}
      emptyStateLabel="No QR code has been generated yet for this school."
    >
      <div>
        <h3 className="font-medium">Instructions for Teachers</h3>
        <ol className="mt-1 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Print the QR code and display in your classroom</li>
          <li>Direct parents to scan during Back to School Night</li>
          <li>
            Parents select your classroom and sign up as room parent or volunteer
          </li>
          <li>You&apos;ll see room parents in DragonHub under your classroom</li>
        </ol>
      </div>

      <div>
        <h3 className="font-medium">Current Settings</h3>
        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
          <li>Room Parent Limit: {settings.roomParentLimit} per classroom</li>
          <li>
            Party Types:{" "}
            {settings.partyTypes
              .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
              .join(", ")}
          </li>
          <li>Signup Status: {settings.enabled ? "Enabled" : "Disabled"}</li>
        </ul>
      </div>
    </QrCodeCard>
  );
}
