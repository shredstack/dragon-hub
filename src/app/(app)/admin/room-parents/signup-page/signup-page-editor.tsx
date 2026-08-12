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
  SignupPageRoles,
} from "@/components/volunteer/signup-page-content";
import { updateSignupPageContent } from "@/actions/volunteer-signups";
import {
  SIGNUP_PAGE_TOKENS,
  applySignupPageTokens,
  type SignupPageContent,
} from "@/lib/signup-page-content";
import { ExternalLink, Loader2, Undo2 } from "lucide-react";

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
  /** The wording the last save replaced, or null if this is the first one. */
  initialPrevious: SignupPageContent | null;
  schoolName: string;
  qrCode: string | null;
}

export function SignupPageEditor({
  initialContent,
  initialPrevious,
  schoolName,
  qrCode,
}: Props) {
  const { addToast } = useToast();
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(initialContent);
  // One step of undo, kept in state so the button updates after a save without
  // waiting for the page to revalidate.
  const [previous, setPrevious] = useState(initialPrevious);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(content) !== JSON.stringify(saved);
  const isPreviousLoaded =
    previous !== null && JSON.stringify(content) === JSON.stringify(previous);

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
      setPrevious(result.previous);
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

  // Loads the old wording into the editor rather than saving it outright, so it
  // can be read in the preview first — and so an accidental click costs nothing
  // until Save. Saving it makes today's wording the new step back, which turns
  // the pair into a toggle.
  function handleRestorePrevious() {
    if (!previous) return;
    setContent(previous);
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
            placeholder="DragonHub"
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
          <Label className="mb-1 block">Intro text</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Anything you put under a heading is collapsed on the sign-up page —
            parents see the heading and tap to read the rest.
          </p>
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
            The shaded box explaining what each role involves, shown under the
            classroom list so it never pushes the classrooms off the screen. Use
            headings for role names and lists for expectations — each role
            collapses to its heading.
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
          {previous && (
            <Button
              variant="outline"
              onClick={handleRestorePrevious}
              disabled={isSaving || isPreviousLoaded}
            >
              <Undo2 className="h-4 w-4" />
              {isPreviousLoaded ? "Previous wording loaded" : "Restore previous wording"}
            </Button>
          )}
          {isDirty && (
            <Button
              variant="ghost"
              onClick={() => setContent(saved)}
              disabled={isSaving}
            >
              Discard changes
            </Button>
          )}
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
              Classroom picker
            </div>
            <SignupPageRoles content={preview} />
            <div className="mt-4 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Rest of the sign-up form
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
