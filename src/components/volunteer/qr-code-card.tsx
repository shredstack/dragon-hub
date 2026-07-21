"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

/**
 * Printable QR code panel, shared by the room parent dashboard and volunteer
 * interest campaigns. Callers supply the actions because the two flows store
 * their codes in different places (schools.volunteer_qr_code vs the campaign
 * row) — everything a board member does with the code is identical.
 */

interface Props {
  title: string;
  blurb: string;
  qrCode: string | null;
  qrDataUrl: string | null | undefined;
  signupUrl: string | undefined;
  /** Used to name the downloaded PNG. */
  downloadName: string;
  /** Omit to hide the generate button for flows where the code always exists. */
  onGenerate?: () => Promise<unknown>;
  onRegenerate: () => Promise<unknown>;
  emptyStateLabel?: string;
  children?: React.ReactNode;
}

export function QrCodeCard({
  title,
  blurb,
  qrCode,
  qrDataUrl,
  signupUrl,
  downloadName,
  onGenerate,
  onRegenerate,
  emptyStateLabel = "No QR code has been generated yet.",
  children,
}: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!onGenerate) return;
    setIsGenerating(true);
    try {
      await onGenerate();
      // Refresh so the server component re-renders with the new code.
      window.location.reload();
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        "Are you sure you want to regenerate the QR code? The old QR code and link will stop working, including any posters already printed."
      )
    ) {
      return;
    }
    setIsRegenerating(true);
    try {
      await onRegenerate();
      window.location.reload();
    } catch (error) {
      console.error("Failed to regenerate QR code:", error);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.download = `${downloadName.replace(/\s+/g, "-")}-qr.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handleCopyLink = () => {
    if (!signupUrl) return;
    navigator.clipboard.writeText(signupUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{blurb}</p>

      {!qrCode ? (
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">{emptyStateLabel}</p>
          {onGenerate && (
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Generating..." : "Generate QR Code"}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-4">
            {qrDataUrl && (
              <div className="rounded-lg border border-border bg-white p-4">
                <Image
                  src={qrDataUrl}
                  alt={`${title} QR code`}
                  width={200}
                  height={200}
                  unoptimized
                />
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={handleDownload}>
                Download QR
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopyLink}>
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                disabled={isRegenerating}
              >
                {isRegenerating ? "Regenerating..." : "Regenerate"}
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h3 className="font-medium">Sign-up URL</h3>
              <code className="mt-1 block break-all rounded bg-muted p-2 text-xs">
                {signupUrl}
              </code>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
