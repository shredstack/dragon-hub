"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { updateRecurringSection } from "@/actions/email-recurring";
import type { EmailAudience } from "@/types";

interface RecurringSectionData {
  id: string;
  key: string;
  title: string;
  bodyTemplate: string;
  linkUrl: string | null;
  linkText: string | null;
  imageUrl: string | null;
  audience: EmailAudience;
  defaultSortOrder: number;
  active: boolean;
}

interface RecurringSectionEditorProps {
  section: RecurringSectionData;
  onClose: () => void;
  onSave: () => void;
}

export function RecurringSectionEditor({
  section,
  onClose,
  onSave,
}: RecurringSectionEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [bodyTemplate, setBodyTemplate] = useState(section.bodyTemplate);
  const [linkUrl, setLinkUrl] = useState(section.linkUrl || "");
  const [linkText, setLinkText] = useState(section.linkText || "");
  const [imageUrl, setImageUrl] = useState(section.imageUrl || "");
  const [audience, setAudience] = useState<EmailAudience>(section.audience);
  const [defaultSortOrder, setDefaultSortOrder] = useState(
    section.defaultSortOrder
  );

  async function handleSave() {
    setIsSaving(true);

    try {
      await updateRecurringSection(section.id, {
        title,
        bodyTemplate,
        linkUrl: linkUrl || null,
        linkText: linkText || null,
        imageUrl: imageUrl || null,
        audience,
        defaultSortOrder,
      });
      onSave();
    } catch (error) {
      console.error("Failed to save section:", error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Recurring Section: {section.key}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label htmlFor="title" className="mb-2 block text-sm font-medium">
              Title
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Section title"
            />
          </div>

          <div>
            <label
              htmlFor="bodyTemplate"
              className="mb-2 block text-sm font-medium"
            >
              Body Template (HTML)
            </label>
            <Textarea
              id="bodyTemplate"
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              placeholder="<p>Content here...</p>"
              rows={8}
              className="font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Available variables: {"{{membership_link}}"}, {"{{member_count}}"},
              {"{{linktree_url}}"}, {"{{yearbook_link}}"}, {"{{school_name}}"},
              {"{{school_year}}"}, {"{{board_roster}}"}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="linkUrl" className="mb-2 block text-sm font-medium">
                Link URL
              </label>
              <Input
                id="linkUrl"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <label htmlFor="linkText" className="mb-2 block text-sm font-medium">
                Link Text
              </label>
              <Input
                id="linkText"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Click here"
              />
            </div>
          </div>

          <div>
            <label htmlFor="imageUrl" className="mb-2 block text-sm font-medium">
              Default Image URL
            </label>
            <Input
              id="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="audience" className="mb-2 block text-sm font-medium">
                Audience
              </label>
              <select
                id="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as EmailAudience)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All (School-wide)</option>
                <option value="pta_only">PTA Members Only</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="sortOrder"
                className="mb-2 block text-sm font-medium"
              >
                Default Sort Order
              </label>
              <Input
                id="sortOrder"
                type="number"
                min={0}
                max={100}
                value={defaultSortOrder}
                onChange={(e) => setDefaultSortOrder(parseInt(e.target.value) || 0)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Lower numbers appear first (0-100)
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
