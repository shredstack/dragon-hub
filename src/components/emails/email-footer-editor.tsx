"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Check, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { SimpleRichTextEditor } from "./simple-rich-text-editor";
import { updateEmailFooter } from "@/actions/email-recurring";
import {
  DEFAULT_EMAIL_FOOTER_HTML,
  EMAIL_FOOTER_VARIABLES,
  renderRecurringTemplate,
} from "@/lib/email/footer";

interface EmailFooterEditorProps {
  title: string;
  bodyTemplate: string;
  active: boolean;
  /** Context for the live preview, resolved on the server. */
  schoolName: string;
  schoolYear: string | null;
  /** The board roster as the footer will render it — see board-roster.ts. */
  rosterHtml: string;
}

/**
 * Writes the block that ends every email.
 *
 * The footer was configurable before this existed — as a row keyed
 * `board_signoff` in a list of recurring sections, edited as raw HTML, on a
 * page nothing linked to. This is the same row; what's new is that it is
 * presented as the thing the secretary thinks she is editing, with the roster
 * rendered in front of her so `{{board_roster}}` is a visible promise rather
 * than a token she has to trust.
 */
export function EmailFooterEditor({
  title: initialTitle,
  bodyTemplate: initialBody,
  active: initialActive,
  schoolName,
  schoolYear,
  rosterHtml,
}: EmailFooterEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [active, setActive] = useState(initialActive);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What is on the server, as far as this form knows. `router.refresh()` gives
  // the page new props but not this component new state, so the last save is
  // what "unchanged" has to be measured against.
  const [saved, setSaved] = useState({
    title: initialTitle,
    body: initialBody,
    active: initialActive,
  });

  const isDirty =
    title !== saved.title || body !== saved.body || active !== saved.active;

  // A footer with no {{board_roster}} is a legitimate choice — some schools
  // sign off without listing the board — but far more often it means the token
  // was deleted by accident while editing around it.
  const hasRosterToken = body.includes("{{board_roster}}");

  const previewHtml = renderRecurringTemplate(body, {
    schoolName,
    schoolYear,
    rosterHtml,
  });

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await updateEmailFooter({ title, bodyTemplate: body, active });
      setSaved({ title, body, active });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      router.refresh();
    } catch (err) {
      console.error("Failed to save footer:", err);
      setError("That didn't save. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Email footer</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The last block of every weekly email. Write it once here and every
            email you start from now on ends with your version.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Switch
            id="footerActive"
            checked={active}
            onCheckedChange={setActive}
          />
          <label htmlFor="footerActive" className="text-sm">
            {active ? "On every email" : "Off"}
          </label>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="footerTitle" className="mb-2 block text-sm font-medium">
            Heading <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="footerTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leave empty for a footer with no heading"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="block text-sm font-medium">Footer text</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setBody(DEFAULT_EMAIL_FOOTER_HTML)}
              className="h-7 text-xs"
            >
              <RotateCcw className="h-3 w-3" />
              Reset wording
            </Button>
          </div>
          <SimpleRichTextEditor
            value={body}
            onChange={setBody}
            tools={["bold", "italic", "underline", "link"]}
            minHeightClass="min-h-[140px]"
            placeholder="Thanks again,"
          />

          <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2">
            {EMAIL_FOOTER_VARIABLES.map((variable) => (
              <p key={variable.token} className="text-xs text-muted-foreground">
                <code className="rounded bg-background px-1 py-0.5 font-mono">
                  {variable.token}
                </code>{" "}
                — {variable.hint}
              </p>
            ))}
          </div>

          {!hasRosterToken && (
            <p className="mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Your footer doesn&apos;t include{" "}
                <code className="font-mono">{"{{board_roster}}"}</code>, so it
                won&apos;t list the board. Add it back if you want the roster to
                keep updating itself as your board changes.
              </span>
            </p>
          )}
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium">
            How it will look
          </span>
          <div className="rounded-md border border-border bg-white p-4">
            {title && (
              <h3 className="mb-3 text-base font-bold text-gray-900">{title}</h3>
            )}
            <div
              className="text-sm leading-relaxed text-gray-700 [&_a]:text-blue-600 [&_a]:underline [&_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            {!rosterHtml && hasRosterToken && (
              <p className="text-xs text-muted-foreground">
                No board members have positions on the roster yet, so nothing
                shows here. It fills in as your board is set up.
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Emails you have already started keep the footer they were created
            with — edit that email&apos;s last block to change it.
          </p>
          <Button onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : justSaved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              "Save footer"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
