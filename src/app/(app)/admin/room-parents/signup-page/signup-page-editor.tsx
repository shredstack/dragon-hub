"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { SimpleRichTextEditor } from "@/components/emails/simple-rich-text-editor";
import {
  SignupPageHeader,
  SignupPageIntro,
} from "@/components/volunteer/signup-page-content";
import { updateSignupPageContent } from "@/actions/volunteer-signups";
import {
  DEFAULT_SIGNUP_PAGE_CONTENT,
  SIGNUP_PAGE_TOKENS,
  applySignupPageTokens,
  type SignupPageContent,
} from "@/lib/signup-page-content";
import { ExternalLink, Loader2, RotateCcw } from "lucide-react";

// Headings and lists are the formatting that makes this page readable; colours,
// images and tables would let the copy drift from the rest of the app's look.
const EDITOR_TOOLS = [
  "heading",
  "paragraph",
  "bold",
  "italic",
  "bulletList",
  "numberedList",
  "link",
] as const;

interface Props {
  initialContent: SignupPageContent;
  schoolName: string;
  qrCode: string | null;
}

export function SignupPageEditor({ initialContent, schoolName, qrCode }: Props) {
  const { addToast } = useToast();
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(content) !== JSON.stringify(saved);

  function set<K extends keyof SignupPageContent>(
    key: K,
    value: SignupPageContent[K]
  ) {
    setContent((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await updateSignupPageContent(content);
      // Take the server's copy back: it's the sanitized version, so the editor
      // shows what parents will actually see rather than the raw draft.
      setContent(result.content);
      setSaved(result.content);
      addToast("Sign-up page content updated", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Could not save changes",
        "destructive"
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setContent(DEFAULT_SIGNUP_PAGE_CONTENT);
  }

  // The preview renders the same components as the public page, with {{school}}
  // filled in so the VP reads the real sentence while editing.
  const preview = applySignupPageTokens(content, schoolName);

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      {/* Editor */}
      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Type{" "}
            {SIGNUP_PAGE_TOKENS.map((t) => (
              <code
                key={t.token}
                className="rounded bg-muted px-1 py-0.5 text-xs"
              >
                {t.token}
              </code>
            ))}{" "}
            anywhere to insert the school name ({schoolName}).
          </p>
        </div>

        <div>
          <Label htmlFor="headline" className="mb-2 block">Page headline</Label>
          <Input
            id="headline"
            value={content.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="Dragon Hub"
          />
        </div>

        <div>
          <Label htmlFor="tagline" className="mb-2 block">Tagline</Label>
          <Input
            id="tagline"
            value={content.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            placeholder="{{school}} Volunteer Sign-up"
          />
        </div>

        <div>
          <Label htmlFor="welcomeHeading" className="mb-2 block">Welcome heading</Label>
          <Input
            id="welcomeHeading"
            value={content.welcomeHeading}
            onChange={(e) => set("welcomeHeading", e.target.value)}
            placeholder="Welcome to {{school}} Volunteer Sign-up!"
          />
        </div>

        <div>
          <Label className="mb-2 block">Intro text</Label>
          <SimpleRichTextEditor
            value={content.introHtml}
            onChange={(v) => set("introHtml", v)}
            tools={[...EDITOR_TOOLS]}
            minHeightClass="min-h-[90px]"
            placeholder="One or two sentences telling parents what this page is for..."
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Role descriptions panel</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {content.showRolesPanel ? "Shown" : "Hidden"}
              </span>
              <Switch
                checked={content.showRolesPanel}
                onCheckedChange={(v) => set("showRolesPanel", v)}
              />
            </div>
          </div>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">
            The shaded box explaining what each role involves. Use headings for
            role names and lists for expectations.
          </p>
          <SimpleRichTextEditor
            value={content.rolesHtml}
            onChange={(v) => set("rolesHtml", v)}
            tools={[...EDITOR_TOOLS]}
            minHeightClass="min-h-[220px]"
            placeholder="Describe the Room Parent and Party Volunteer roles..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="h-4 w-4" />
            Restore default wording
          </Button>
          {qrCode && (
            <a
              href={`/volunteer-signup/${qrCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              View live page
            </a>
          )}
          {isDirty && (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {/* Live preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-medium">Preview</p>
        <div className="rounded-lg border border-border bg-muted p-4">
          <SignupPageHeader content={preview} />
          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
            <SignupPageIntro content={preview} />
            <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Classroom picker and sign-up form
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
