"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, FileText, Code } from "lucide-react";
import { compileEmailHtml } from "@/lib/email/template";
import type { EmailAudience, EmailSectionType } from "@/types";

interface SectionData {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkText: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  imageLinkUrl: string | null;
  sectionType: EmailSectionType;
  recurringKey: string | null;
  audience: EmailAudience;
  sortOrder: number;
}

interface EmailPreviewProps {
  sections: SectionData[];
  schoolName: string;
  ptaHtml: string | null;
  schoolHtml: string | null;
  previewAudience: "pta_only" | "all";
  onAudienceChange: (audience: "pta_only" | "all") => void;
}

export function EmailPreview({
  sections,
  schoolName,
  ptaHtml,
  schoolHtml,
  previewAudience,
  onAudienceChange,
}: EmailPreviewProps) {
  const [copiedType, setCopiedType] = useState<"html" | "formatted" | null>(null);

  // Filter sections based on audience for preview
  const filteredSections =
    previewAudience === "all"
      ? sections.filter((s) => s.audience === "all")
      : sections;

  // Generate preview HTML (live from sections)
  const previewHtml = compileEmailHtml({
    schoolName,
    greeting:
      previewAudience === "pta_only"
        ? `Hi ${schoolName} PTA Members,`
        : `Hi ${schoolName} Families,`,
    sections: filteredSections.map((s) => ({
      title: s.title,
      body: s.body,
      linkUrl: s.linkUrl || undefined,
      linkText: s.linkText || undefined,
      imageUrl: s.imageUrl || undefined,
      imageAlt: s.imageAlt || undefined,
      imageLinkUrl: s.imageLinkUrl || undefined,
    })),
    audience: previewAudience,
  });

  // Get compiled HTML (from database) or use preview
  const compiledHtml =
    previewAudience === "pta_only" ? ptaHtml : schoolHtml;

  async function handleCopyHtml() {
    const htmlToCopy = compiledHtml || previewHtml;
    try {
      await navigator.clipboard.writeText(htmlToCopy);
      setCopiedType("html");
      setTimeout(() => setCopiedType(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }

  async function handleCopyFormatted() {
    const htmlToCopy = compiledHtml || previewHtml;
    try {
      // Create a temporary element to get plain text version
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = htmlToCopy;
      const plainText = tempDiv.textContent || tempDiv.innerText || "";

      // Use the Clipboard API to write both HTML and plain text
      // This allows Gmail and other rich text editors to paste formatted content
      const htmlBlob = new Blob([htmlToCopy], { type: "text/html" });
      const textBlob = new Blob([plainText], { type: "text/plain" });

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);

      setCopiedType("formatted");
      setTimeout(() => setCopiedType(null), 2000);
    } catch (error) {
      console.error("Failed to copy formatted:", error);
      // Fallback to HTML copy if ClipboardItem is not supported
      handleCopyHtml();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 border-b border-border bg-background p-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <Button
              variant={previewAudience === "pta_only" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onAudienceChange("pta_only")}
            >
              PTA Members
            </Button>
            <Button
              variant={previewAudience === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onAudienceChange("all")}
            >
              School-wide
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyFormatted}
              title="Copy formatted text for pasting into Gmail"
            >
              {copiedType === "formatted" ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Copy for Gmail
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyHtml}
              title="Copy raw HTML code"
            >
              {copiedType === "html" ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Code className="h-4 w-4" />
                  Copy HTML
                </>
              )}
            </Button>
          </div>
        </div>

        {previewAudience === "all" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {filteredSections.length} of {sections.length} sections
            (hiding PTA-only content)
          </p>
        )}
      </div>

      {/* Preview iframe */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <div className="mx-auto" style={{ maxWidth: 620 }}>
          <iframe
            srcDoc={previewHtml}
            title="Email Preview"
            className="w-full rounded-md border bg-white shadow-sm"
            style={{ minHeight: 600 }}
          />
        </div>
      </div>
    </div>
  );
}
