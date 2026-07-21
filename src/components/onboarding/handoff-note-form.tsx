"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createHandoffNote,
  updateHandoffNote,
  generateHandoffNoteFromRawNotes,
} from "@/actions/handoff-notes";
import {
  Loader2,
  Save,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
} from "lucide-react";
import type { BoardHandoffNoteContent } from "@/types";

interface HandoffNoteFormProps {
  /** Present in edit mode; omitted when writing a brand-new note. */
  note?: BoardHandoffNoteContent;
  /** Called with the saved note's id. */
  onSaved?: (noteId: string) => void;
  onCancel?: () => void;
}

export function HandoffNoteForm({
  note,
  onSaved,
  onCancel,
}: HandoffNoteFormProps) {
  const isEditing = !!note;
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [rawNotes, setRawNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: note?.title ?? "",
    keyAccomplishments: note?.keyAccomplishments ?? "",
    ongoingProjects: note?.ongoingProjects ?? "",
    tipsAndAdvice: note?.tipsAndAdvice ?? "",
    importantContacts: note?.importantContacts ?? "",
    filesAndResources: note?.filesAndResources ?? "",
  });

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = {
      title: formData.title.trim() || null,
      keyAccomplishments: formData.keyAccomplishments || null,
      ongoingProjects: formData.ongoingProjects || null,
      tipsAndAdvice: formData.tipsAndAdvice || null,
      importantContacts: formData.importantContacts || null,
      filesAndResources: formData.filesAndResources || null,
    };

    startTransition(async () => {
      if (note) {
        const result = await updateHandoffNote(note.id, payload);
        if (!result.success) {
          setError(result.error ?? "Failed to save note");
          return;
        }
        onSaved?.(note.id);
        return;
      }

      const result = await createHandoffNote(payload);
      if (!result.success || !result.noteId) {
        setError(result.error ?? "Failed to save note");
        return;
      }
      onSaved?.(result.noteId);
    });
  };

  /**
   * Generation saves a NEW note rather than replacing anything on screen, so
   * there's nothing to warn about losing — the draft simply appears in the
   * history for the author to edit or delete.
   */
  const handleGenerate = async () => {
    if (!rawNotes.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateHandoffNoteFromRawNotes(rawNotes);

      if (result.success && result.noteId) {
        setRawNotes("");
        setShowAiHelper(false);
        onSaved?.(result.noteId);
      } else {
        setError(result.error || "Failed to generate notes");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate notes");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI helper — new notes only. Editing an existing note is manual, so a
          generated draft can never overwrite words someone already wrote. */}
      {!isEditing && (
        <div className="rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={() => setShowAiHelper(!showAiHelper)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Generate from your notes</p>
                <p className="text-sm text-muted-foreground">
                  Paste rough bullets and AI drafts a new note you can edit
                </p>
              </div>
            </div>
            {showAiHelper ? (
              <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
          </button>

          {showAiHelper && (
            <div className="space-y-4 border-t border-border p-4">
              <div className="space-y-2">
                <Label htmlFor="rawNotes" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Paste your notes
                </Label>
                <p className="text-xs text-muted-foreground">
                  Paste notes from a text file, email, or document. AI organizes
                  them into a new handoff note — your existing notes are left
                  alone, and you can edit or delete the draft afterward.
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
                    Generate Draft Note
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Form Fields */}
      <div className="space-y-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title">Title (optional)</Label>
          <p className="text-xs text-muted-foreground">
            Helpful when there are several notes for the same year, e.g.
            &ldquo;Mid-year handoff&rdquo; or &ldquo;Fundraising specifics&rdquo;.
          </p>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleChange("title", e.target.value)}
            placeholder="End-of-year handoff"
          />
        </div>

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
          <Label htmlFor="tipsAndAdvice">Tips &amp; Advice</Label>
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
          <Label htmlFor="filesAndResources">Files &amp; Resources</Label>
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isEditing ? "Save Changes" : "Save as New Note"}
            </>
          )}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
