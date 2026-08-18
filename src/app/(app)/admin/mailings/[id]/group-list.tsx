"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  exportMailingGroupRoster,
  exportMailingGroupRosterPdf,
  setMailingGroupSent,
  updateMailingGroupNote,
} from "@/actions/mailings";
import {
  gmailComposeUrl,
  MAILING_RECIPIENT_ROLES,
  type MailingGroupView,
} from "@/lib/mail-merge-shared";
import { renderGroup } from "@/lib/mail-merge-render";
import { toCsv, downloadBase64, downloadCsv } from "@/lib/csv";
import type { MailingAttachmentView } from "./attachments";

/**
 * The list a board member works down: one row per email, each with the
 * addresses, the merged message, and a tick.
 *
 * The send flow is two clicks, and it is the whole reason the tool exists in
 * this shape. "Open in Gmail" copies the formatted body to the clipboard and
 * opens a Gmail compose window already addressed — the user presses paste and
 * send. The body cannot travel in the URL (it would arrive as plain text, and a
 * real message plus thirty addresses overruns what a URL can carry), so the
 * clipboard carries it and the URL carries the addressing.
 */
export function GroupList({
  groups,
  subjectTemplate,
  bodyTemplate,
  dirty,
  rosterPresetId,
  attachments,
  senderName,
  onSave,
}: {
  groups: MailingGroupView[];
  subjectTemplate: string;
  bodyTemplate: string;
  /** Unsaved edits upstream — the previews here are still accurate, but the
   *  stored copy isn't, so the banner offers to save before a long session. */
  dirty: boolean;
  rosterPresetId: string | null;
  attachments: MailingAttachmentView[];
  senderName: string;
  onSave: () => Promise<void>;
}) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
        <p className="font-medium">No groups yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Open <strong>Who it goes to</strong> and build the list. You&apos;ll
          get one email per classroom, grade or committee, ready to send.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dirty && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>
            You have unsaved changes to the message. The previews below include
            them, but save before you start sending.
          </span>
          <Button size="sm" variant="outline" onClick={() => void onSave()}>
            Save now
          </Button>
        </div>
      )}

      {(attachments.length > 0 || rosterPresetId) && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Paperclip className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Attachments have to be added in Gmail — the clipboard can&apos;t
            carry a file. Each row below has a download button for everything
            that email should carry.
          </span>
        </p>
      )}

      <div className="space-y-3">
        {groups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            subjectTemplate={subjectTemplate}
            bodyTemplate={bodyTemplate}
            rosterPresetId={rosterPresetId}
            attachments={attachments}
            senderName={senderName}
            expanded={expanded === group.id}
            onToggle={() =>
              setExpanded((id) => (id === group.id ? null : group.id))
            }
            addToast={addToast}
          />
        ))}
      </div>
    </div>
  );
}

function GroupRow({
  group,
  subjectTemplate,
  bodyTemplate,
  rosterPresetId,
  attachments,
  senderName,
  expanded,
  onToggle,
  addToast,
}: {
  group: MailingGroupView;
  subjectTemplate: string;
  bodyTemplate: string;
  rosterPresetId: string | null;
  attachments: MailingAttachmentView[];
  senderName: string;
  expanded: boolean;
  onToggle: () => void;
  addToast: (
    message: string,
    variant?: "default" | "destructive" | "success"
  ) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(group.note ?? "");
  // Which roster is building, so only that button says so.
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);

  const rendered = useMemo(
    () =>
      renderGroup({
        subjectTemplate,
        bodyTemplate,
        group: {
          variables: { ...group.variables, sender: group.variables.sender || senderName },
          note,
          recipients: group.recipients,
        },
      }),
    [subjectTemplate, bodyTemplate, group, note, senderName]
  );

  /**
   * Put the message on the clipboard as both rich and plain text, then open
   * Gmail. Both flavours matter: Gmail takes the HTML, and anything that
   * refuses rich text still gets a readable message with the links spelled out.
   */
  const copyBody = async () => {
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([rendered.html], { type: "text/html" }),
            "text/plain": new Blob([rendered.text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(rendered.text);
      }
      return true;
    } catch {
      return false;
    }
  };

  const openInGmail = async () => {
    const copied = await copyBody();
    window.open(
      gmailComposeUrl({ to: rendered.to, subject: rendered.subject }),
      "_blank",
      "noopener,noreferrer"
    );
    addToast(
      copied
        ? "Message copied — paste it into the Gmail window."
        : "Gmail opened, but the clipboard was blocked. Use Copy message.",
      copied ? "success" : "destructive"
    );
  };

  const copyText = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addToast(`${what} copied.`, "success");
    } catch {
      addToast(`Couldn't copy the ${what.toLowerCase()}.`, "destructive");
    }
  };

  /**
   * The roster in whichever shape the board member is about to attach.
   *
   * Two files, one query: the PDF is the sheet a teacher reads, the CSV is the
   * copy someone works in. Neither travels with the copied message body — an
   * attachment can't ride the clipboard — so both are downloads, which is what
   * the panel's wording says.
   */
  const downloadRoster = async (as: "pdf" | "csv") => {
    if (!rosterPresetId) return;
    setDownloading(as);
    try {
      if (as === "pdf") {
        const result = await exportMailingGroupRosterPdf(
          group.id,
          rosterPresetId
        );
        if (!result.base64) {
          addToast(`Nobody has signed up in ${group.name} yet.`, "destructive");
          return;
        }
        downloadBase64(
          `${result.fileName}.pdf`,
          result.base64,
          "application/pdf"
        );
        return;
      }
      const result = await exportMailingGroupRoster(group.id, rosterPresetId);
      downloadCsv(
        `${result.fileName}.csv`,
        toCsv(result.columns, result.rows)
      );
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Couldn't build the roster.",
        "destructive"
      );
    } finally {
      setDownloading(null);
    }
  };

  const saveNote = () => {
    if ((group.note ?? "") === note.trim()) return;
    startTransition(async () => {
      try {
        await updateMailingGroupNote(group.id, note);
        router.refresh();
      } catch {
        addToast("Couldn't save that note.", "destructive");
      }
    });
  };

  const toggleSent = () => {
    startTransition(async () => {
      try {
        await setMailingGroupSent(group.id, !group.sentAt);
        router.refresh();
      } catch {
        addToast("Couldn't update that.", "destructive");
      }
    });
  };

  const roleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of group.recipients) {
      counts.set(r.role, (counts.get(r.role) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [group.recipients]);

  return (
    <div
      className={`rounded-lg border bg-card transition-colors ${
        group.sentAt ? "border-border opacity-70" : "border-border"
      }`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{group.name}</span>
              {group.sentAt && (
                <Badge variant="success">
                  <Check className="mr-1 h-3 w-3" />
                  Marked sent
                </Badge>
              )}
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              {roleCounts.map(([role, count]) => (
                <Badge key={role} variant="secondary">
                  {count}{" "}
                  {MAILING_RECIPIENT_ROLES[
                    role as keyof typeof MAILING_RECIPIENT_ROLES
                  ] ?? role}
                </Badge>
              ))}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={openInGmail}>
            <ExternalLink className="h-4 w-4" />
            Open in Gmail
          </Button>
          <Button
            size="sm"
            variant={group.sentAt ? "ghost" : "outline"}
            onClick={toggleSent}
            disabled={pending}
          >
            <Check className="h-4 w-4" />
            {group.sentAt ? "Undo" : "Mark sent"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border p-4">
          <Field label="To" onCopy={() => copyText(rendered.to, "Addresses")}>
            <p className="break-all text-sm text-muted-foreground">
              {rendered.to}
            </p>
          </Field>

          <Field
            label="Subject"
            onCopy={() => copyText(rendered.subject, "Subject")}
          >
            <p className="text-sm text-muted-foreground">{rendered.subject}</p>
          </Field>

          <Field label="Message" onCopy={() => void copyBody()}>
            <div
              className="prose prose-sm max-w-none text-sm text-muted-foreground [&_a]:text-dragon-blue-500"
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          </Field>

          <div>
            <label
              htmlFor={`note-${group.id}`}
              className="text-sm font-medium"
            >
              Note just for this group
            </label>
            <p className="mb-1 text-xs text-muted-foreground">
              Appears wherever your message says{" "}
              <code className="text-dragon-blue-500">{"{{note}}"}</code>.
            </p>
            <Textarea
              id={`note-${group.id}`}
              value={note}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Ms. Chen asked that helpers arrive at 1:45."
            />
          </div>

          {(rosterPresetId || attachments.length > 0) && (
            <div>
              <p className="text-sm font-medium">Attach to this email</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {rosterPresetId && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadRoster("pdf")}
                      disabled={downloading !== null}
                    >
                      <FileText className="h-4 w-4" />
                      {downloading === "pdf"
                        ? "Building…"
                        : `${group.name} roster (PDF)`}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadRoster("csv")}
                      disabled={downloading !== null}
                    >
                      <Download className="h-4 w-4" />
                      {downloading === "csv" ? "Building…" : "CSV"}
                    </Button>
                  </>
                )}
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.blobUrl}
                    download={a.fileName}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:border-dragon-blue-500"
                  >
                    <Download className="h-4 w-4" />
                    {a.fileName}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  onCopy,
  children,
}: {
  label: string;
  onCopy: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Button size="sm" variant="ghost" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      {children}
    </div>
  );
}
