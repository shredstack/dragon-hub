"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveHandoffNote } from "@/actions/handoff-notes";
import { Loader2, Save, CheckCircle } from "lucide-react";

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
  const [saved, setSaved] = useState(false);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
