"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  saveHandoffNote,
  generateHandoffNoteFromRawNotes,
} from "@/actions/handoff-notes";
import {
  Loader2,
  Save,
  CheckCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";

interface HandoffNoteFormProps {
  initialData?: {
    keyAccomplishments: string;
    ongoingProjects: string;
    tipsAndAdvice: string;
    importantContacts: string;
    filesAndResources: string;
  };
}

export function HandoffNoteForm({ initialData }: HandoffNoteFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [rawNotes, setRawNotes] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    keyAccomplishments: initialData?.keyAccomplishments ?? "",
    ongoingProjects: initialData?.ongoingProjects ?? "",
    tipsAndAdvice: initialData?.tipsAndAdvice ?? "",
    importantContacts: initialData?.importantContacts ?? "",
    filesAndResources: initialData?.filesAndResources ?? "",
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      await saveHandoffNote({
        keyAccomplishments: formData.keyAccomplishments || null,
        ongoingProjects: formData.ongoingProjects || null,
        tipsAndAdvice: formData.tipsAndAdvice || null,
        importantContacts: formData.importantContacts || null,
        filesAndResources: formData.filesAndResources || null,
      });
      setSaved(true);
    });
  };

  const handleGenerate = async () => {
    if (!rawNotes.trim()) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const result = await generateHandoffNoteFromRawNotes(rawNotes);

      if (result.success && result.data) {
        setFormData({
          keyAccomplishments: result.data.keyAccomplishments,
          ongoingProjects: result.data.ongoingProjects,
          tipsAndAdvice: result.data.tipsAndAdvice,
          importantContacts: result.data.importantContacts,
          filesAndResources: result.data.filesAndResources,
        });
        setSaved(false);
        setShowAiHelper(false);
        setRawNotes("");
      } else {
        setGenerateError(result.error || "Failed to generate notes");
      }
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Failed to generate notes"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const hasExistingContent =
    formData.keyAccomplishments ||
    formData.ongoingProjects ||
    formData.tipsAndAdvice ||
    formData.importantContacts ||
    formData.filesAndResources;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI Helper Section */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowAiHelper(!showAiHelper)}
          className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">Generate from your notes</p>
              <p className="text-sm text-muted-foreground">
                Paste your raw notes and let AI organize them
              </p>
            </div>
          </div>
          {showAiHelper ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {showAiHelper && (
          <div className="border-t border-border p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rawNotes" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Paste your notes
              </Label>
              <p className="text-xs text-muted-foreground">
                Paste notes from a text file, email, or document. The AI will
                extract and organize the information into the appropriate
                sections below.
              </p>
              <Textarea
                id="rawNotes"
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                placeholder={`Example notes to paste:

- Ran successful book fair in October, raised $2,500
- Still working on the spring carnival planning - need to book DJ
- Contact Sarah at the print shop for flyers (555-1234)
- Budget spreadsheet is in the shared drive: drive.google.com/...
- Tip: Order supplies early, they sell out fast in March
- Principal prefers email over calls
- Membership is tracked in the Google Sheet I shared`}
                rows={8}
                className="font-mono text-sm"
              />
            </div>

            {generateError && (
              <p className="text-sm text-destructive">{generateError}</p>
            )}

            {hasExistingContent && (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Note: Generating will replace your current content in all
                fields.
              </p>
            )}

            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !rawNotes.trim()}
              variant="secondary"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Handoff Notes
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Form Fields */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-6">
        {/* Key Accomplishments */}
        <div className="space-y-2">
          <Label htmlFor="keyAccomplishments">Key Accomplishments</Label>
          <p className="text-xs text-muted-foreground">
            What did you accomplish during your tenure? What were the highlights?
          </p>
          <Textarea
            id="keyAccomplishments"
            value={formData.keyAccomplishments}
            onChange={(e) => handleChange("keyAccomplishments", e.target.value)}
            placeholder="e.g., Increased membership by 20%, organized successful fall festival..."
            rows={4}
          />
        </div>

        {/* Ongoing Projects */}
        <div className="space-y-2">
          <Label htmlFor="ongoingProjects">Ongoing Projects</Label>
          <p className="text-xs text-muted-foreground">
            What projects or initiatives are in progress that your successor
            should continue?
          </p>
          <Textarea
            id="ongoingProjects"
            value={formData.ongoingProjects}
            onChange={(e) => handleChange("ongoingProjects", e.target.value)}
            placeholder="e.g., Partnership with local business for book fair, fundraising committee restructuring..."
            rows={4}
          />
        </div>

        {/* Tips and Advice */}
        <div className="space-y-2">
          <Label htmlFor="tipsAndAdvice">Tips & Advice</Label>
          <p className="text-xs text-muted-foreground">
            What advice would you give to someone stepping into this role? Any
            lessons learned?
          </p>
          <Textarea
            id="tipsAndAdvice"
            value={formData.tipsAndAdvice}
            onChange={(e) => handleChange("tipsAndAdvice", e.target.value)}
            placeholder="e.g., Start planning spring events by January, build relationships with teachers early..."
            rows={4}
          />
        </div>

        {/* Important Contacts */}
        <div className="space-y-2">
          <Label htmlFor="importantContacts">Important Contacts</Label>
          <p className="text-xs text-muted-foreground">
            Who are the key people they should know? Include names and roles.
          </p>
          <Textarea
            id="importantContacts"
            value={formData.importantContacts}
            onChange={(e) => handleChange("importantContacts", e.target.value)}
            placeholder="e.g., Principal Smith (schedule meetings through office), Vendor contact at Party City..."
            rows={3}
          />
        </div>

        {/* Files and Resources */}
        <div className="space-y-2">
          <Label htmlFor="filesAndResources">Files & Resources</Label>
          <p className="text-xs text-muted-foreground">
            Links to important documents, spreadsheets, or resources in Google
            Drive.
          </p>
          <Textarea
            id="filesAndResources"
            value={formData.filesAndResources}
            onChange={(e) => handleChange("filesAndResources", e.target.value)}
            placeholder="Paste links to important Google Drive files, templates, or other resources..."
            rows={3}
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Handoff Note
            </>
          )}
        </Button>
        {saved && (
          <span className="inline-flex items-center text-sm text-green-600">
            <CheckCircle className="mr-1 h-4 w-4" />
            Saved successfully
          </span>
        )}
      </div>
    </form>
  );
}
