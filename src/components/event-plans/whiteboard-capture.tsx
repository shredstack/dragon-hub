"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Camera,
  Loader2,
  AlertTriangle,
  Check,
  RotateCcw,
  ArrowRight,
  FileText,
} from "lucide-react";
import {
  transcribeWhiteboard,
  organizeTranscription,
} from "@/actions/event-plan-meetings";
import type { MeetingActionItem } from "@/types";

interface WhiteboardCaptureProps {
  meetingId: string;
  eventPlanId: string;
  meetingTitle: string;
  topic: string;
  agenda?: string;
  onInsert: (content: string, actionItems: MeetingActionItem[]) => void;
}

type Step = "capture" | "transcribing" | "review" | "organizing" | "organized";

const confidenceColors = {
  high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function WhiteboardCapture({
  meetingId,
  eventPlanId,
  onInsert,
}: WhiteboardCaptureProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("capture");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Transcription state
  const [rawText, setRawText] = useState("");
  const [confidence, setConfidence] = useState<"high" | "medium" | "low">(
    "high"
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const [layoutDescription, setLayoutDescription] = useState("");

  // Organization state
  const [organizedSections, setOrganizedSections] = useState<
    { heading: string; content: string }[]
  >([]);
  const [extractedActionItems, setExtractedActionItems] = useState<string[]>(
    []
  );
  const [summary, setSummary] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep("capture");
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadedImageUrl(null);
    setImageId(null);
    setError(null);
    setRawText("");
    setConfidence("high");
    setWarnings([]);
    setLayoutDescription("");
    setOrganizedSections([]);
    setExtractedActionItems([]);
    setSummary("");
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    setOpen(newOpen);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUploadAndTranscribe = async () => {
    if (!selectedFile) return;

    setStep("transcribing");
    setError(null);

    try {
      // Upload image
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("meetingId", meetingId);
      formData.append("eventPlanId", eventPlanId);

      const uploadRes = await fetch("/api/upload/meeting-notes-image", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || "Failed to upload image");
      }

      const { url, imageId: newImageId } = await uploadRes.json();
      setUploadedImageUrl(url);
      setImageId(newImageId);

      // Transcribe
      const result = await transcribeWhiteboard(meetingId, url, newImageId);

      setRawText(result.rawText);
      setConfidence(result.confidence);
      setWarnings(result.warnings);
      setLayoutDescription(result.layoutDescription);
      setStep("review");
    } catch (err) {
      console.error("Upload/transcription error:", err);
      setError(err instanceof Error ? err.message : "Failed to process image");
      setStep("capture");
    }
  };

  const handleOrganize = async () => {
    setStep("organizing");
    setError(null);

    try {
      const result = await organizeTranscription(
        meetingId,
        rawText,
        imageId ?? undefined
      );

      setOrganizedSections(result.sections);
      setExtractedActionItems(result.actionItems);
      setSummary(result.summary);
      setStep("organized");
    } catch (err) {
      console.error("Organization error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to organize content"
      );
      setStep("review");
    }
  };

  const handleInsertRaw = () => {
    // Insert raw text wrapped in whiteboard capture styling
    const content = `
<div class="whiteboard-capture">
  <p><em>Captured from whiteboard/handwritten notes</em></p>
  <pre style="white-space: pre-wrap; font-family: inherit;">${rawText}</pre>
</div>
    `.trim();

    onInsert(content, []);
    handleOpenChange(false);
  };

  const handleInsertOrganized = () => {
    // Build HTML from organized sections
    const sectionsHtml = organizedSections
      .map((s) => `<h3>${s.heading}</h3>${s.content}`)
      .join("");

    const content = `
<div class="whiteboard-capture">
  <p><em>Captured from whiteboard/handwritten notes</em></p>
  ${summary ? `<p><strong>Summary:</strong> ${summary}</p>` : ""}
  ${sectionsHtml}
</div>
    `.trim();

    // Convert extracted action items to MeetingActionItem format
    const actionItems: MeetingActionItem[] = extractedActionItems.map(
      (text) => ({
        text,
      })
    );

    onInsert(content, actionItems);
    handleOpenChange(false);
  };

  const handleRetake = () => {
    setStep("capture");
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setError(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Camera className="h-4 w-4" />
        Scan Notes
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {step === "capture" && "Capture Whiteboard / Handwritten Notes"}
              {step === "transcribing" && "Transcribing..."}
              {step === "review" && "Review Transcription"}
              {step === "organizing" && "Organizing Notes..."}
              {step === "organized" && "Organized Notes"}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Capture */}
          {step === "capture" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Take a photo of a whiteboard, flip chart, or handwritten notes.
                The AI will transcribe the content for you to review and edit.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />

              {previewUrl ? (
                <div className="space-y-4">
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleRetake}
                      className="flex-1"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Retake
                    </Button>
                    <Button
                      onClick={handleUploadAndTranscribe}
                      className="flex-1"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Transcribe
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8"
                  variant="outline"
                >
                  <Camera className="mr-2 h-6 w-6" />
                  Take Photo or Select Image
                </Button>
              )}
            </div>
          )}

          {/* Step 2: Transcribing */}
          {step === "transcribing" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Reading your notes carefully...
              </p>
            </div>
          )}

          {/* Step 3: Review Transcription */}
          {step === "review" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Confidence:</span>
                <Badge className={confidenceColors[confidence]}>
                  {confidence}
                </Badge>
              </div>

              {warnings.length > 0 && (
                <div className="space-y-1">
                  {warnings.map((warning, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md bg-yellow-50 p-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200"
                    >
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      {warning}
                    </div>
                  ))}
                </div>
              )}

              {layoutDescription && (
                <p className="text-xs text-muted-foreground">
                  Layout: {layoutDescription}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {uploadedImageUrl && (
                  <div className="aspect-video overflow-hidden rounded-lg border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uploadedImageUrl}
                      alt="Uploaded"
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Raw Transcription (edit to correct errors)
                  </label>
                  <Textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={handleRetake}>
                  <RotateCcw className="h-4 w-4" />
                  Retake Photo
                </Button>
                <Button variant="outline" onClick={handleInsertRaw}>
                  <FileText className="h-4 w-4" />
                  Insert Raw Text
                </Button>
                <Button onClick={handleOrganize}>
                  <ArrowRight className="h-4 w-4" />
                  Organize Notes
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 4: Organizing */}
          {step === "organizing" && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Organizing your notes...
              </p>
            </div>
          )}

          {/* Step 5: Organized */}
          {step === "organized" && (
            <div className="space-y-4">
              {summary && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm font-medium">Summary</p>
                  <p className="text-sm text-muted-foreground">{summary}</p>
                </div>
              )}

              <div className="space-y-4">
                {organizedSections.map((section, i) => (
                  <div key={i}>
                    <h4 className="font-medium">{section.heading}</h4>
                    <div
                      className="prose prose-sm dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: section.content }}
                    />
                  </div>
                ))}
              </div>

              {extractedActionItems.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">
                    Extracted Action Items ({extractedActionItems.length})
                  </p>
                  <ul className="space-y-1">
                    {extractedActionItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    These will be added to your meeting action items
                  </p>
                </div>
              )}

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setStep("review")}>
                  <RotateCcw className="h-4 w-4" />
                  Edit & Retry
                </Button>
                <Button onClick={handleInsertOrganized}>
                  <Check className="h-4 w-4" />
                  Insert into Notes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
