"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { generateVolunteerQrCode, regenerateVolunteerQrCode, type VolunteerSettings } from "@/actions/volunteer-signups";

interface Props {
  qrCode: string | null;
  qrDataUrl: string | null | undefined;
  signupUrl: string | undefined;
  schoolName: string;
  settings: VolunteerSettings;
}

export function QrCodeSection({ qrCode, qrDataUrl, signupUrl, schoolName, settings }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [localQrDataUrl] = useState(qrDataUrl);
  const [localSignupUrl] = useState(signupUrl);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generateVolunteerQrCode();
      // Refresh page to get new QR code
      window.location.reload();
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm("Are you sure you want to regenerate the QR code? The old QR code and link will stop working.")) {
      return;
    }
    setIsRegenerating(true);
    try {
      await regenerateVolunteerQrCode();
      // Refresh page to get new QR code
      window.location.reload();
    } catch (error) {
      console.error("Failed to regenerate QR code:", error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDownload = () => {
    if (!localQrDataUrl) return;
    const link = document.createElement("a");
    link.download = `${schoolName.replace(/\s+/g, "-")}-volunteer-signup-qr.png`;
    link.href = localQrDataUrl;
    link.click();
  };

  const handleCopyLink = () => {
    if (!localSignupUrl) return;
    navigator.clipboard.writeText(localSignupUrl);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-2 text-lg font-semibold">Volunteer Sign-up QR Code</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Share this QR code with teachers for Back to School Night. Parents can scan it
        to sign up as room parents or party volunteers.
      </p>

      {!qrCode ? (
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">
            No QR code has been generated yet for this school.
          </p>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Generating..." : "Generate QR Code"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* QR Code Display */}
          <div className="flex flex-col items-center gap-4">
            {localQrDataUrl && (
              <div className="rounded-lg border border-border bg-white p-4">
                <Image
                  src={localQrDataUrl}
                  alt="Volunteer signup QR code"
                  width={200}
                  height={200}
                  unoptimized
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleDownload}>
                Download QR
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyLink}>
                Copy Link
              </Button>
              <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={isRegenerating}>
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="font-medium">Sign-up URL</h3>
              <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">
                {localSignupUrl}
              </code>
            </div>

            <div>
              <h3 className="font-medium">Instructions for Teachers</h3>
              <ol className="mt-1 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                <li>Print the QR code and display in your classroom</li>
                <li>Direct parents to scan during Back to School Night</li>
                <li>Parents select your classroom and sign up as room parent or volunteer</li>
                <li>You&apos;ll see room parents in DragonHub under your classroom</li>
              </ol>
            </div>

            <div>
              <h3 className="font-medium">Current Settings</h3>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                <li>Room Parent Limit: {settings.roomParentLimit} per classroom</li>
                <li>Party Types: {settings.partyTypes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ")}</li>
                <li>Signup Status: {settings.enabled ? "Enabled" : "Disabled"}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
