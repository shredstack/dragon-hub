"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleRichTextEditor } from "@/components/emails/simple-rich-text-editor";
import {
  deleteMailing,
  rebuildMailingGroups,
  resetMailingProgress,
  updateMailing,
} from "@/actions/mailings";
import {
  mailingProgress,
  unknownVariables,
  type MailingAudience,
  type MailingGroupView,
} from "@/lib/mail-merge-shared";
import { AudienceForm } from "./audience-form";
import { GroupList } from "./group-list";
import { AttachmentManager, type MailingAttachmentView } from "./attachments";
import { VariableHelp } from "./variable-help";

export interface MailingView {
  id: string;
  title: string;
  subjectTemplate: string;
  bodyTemplate: string;
  rosterPresetId: string | null;
  status: "draft" | "sending" | "done";
  audience: MailingAudience;
}

export interface AudienceOptions {
  committees: { id: string; name: string; perClassroomLimit: number | null }[];
  classrooms: {
    id: string;
    name: string;
    gradeLevel: string | null;
    isDli: boolean | null;
  }[];
  rosterPresets: { id: string; label: string; description: string }[];
}

export function MailingEditor({
  mailing,
  groups,
  attachments,
  options,
  senderName,
}: {
  mailing: MailingView;
  groups: MailingGroupView[];
  attachments: MailingAttachmentView[];
  options: AudienceOptions;
  senderName: string;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(mailing.title);
  const [subject, setSubject] = useState(mailing.subjectTemplate);
  const [body, setBody] = useState(mailing.bodyTemplate);
  const [rosterPresetId, setRosterPresetId] = useState(mailing.rosterPresetId);
  const [audience, setAudience] = useState<MailingAudience>(mailing.audience);

  const dirty =
    title !== mailing.title ||
    subject !== mailing.subjectTemplate ||
    body !== mailing.bodyTemplate ||
    rosterPresetId !== mailing.rosterPresetId;

  const progress = useMemo(() => mailingProgress(groups), [groups]);

  // A typo'd `{{variabel}}` is invisible until thirty emails have gone out with
  // it standing in the text, so it is called out here rather than silently
  // blanked at merge time.
  const unknown = useMemo(
    () => [...new Set([...unknownVariables(subject), ...unknownVariables(body)])],
    [subject, body]
  );

  const save = () =>
    new Promise<void>((resolve) => {
      startTransition(async () => {
        try {
          await updateMailing(mailing.id, {
            title,
            subjectTemplate: subject,
            bodyTemplate: body,
            rosterPresetId,
          });
          addToast("Saved.", "success");
          router.refresh();
        } catch (error) {
          addToast(
            error instanceof Error ? error.message : "Couldn't save.",
            "destructive"
          );
        } finally {
          resolve();
        }
      });
    });

  const rebuild = (next: MailingAudience) => {
    startTransition(async () => {
      try {
        // Save first: rebuilding is the step someone takes after writing, and
        // losing the draft to a page refresh they didn't ask for would be a
        // nasty surprise.
        if (dirty) {
          await updateMailing(mailing.id, {
            title,
            subjectTemplate: subject,
            bodyTemplate: body,
            rosterPresetId,
          });
        }
        const result = await rebuildMailingGroups(mailing.id, next);
        setAudience(next);
        if (result.built === 0) {
          addToast(
            "Nothing matched — no classroom has the people you picked.",
            "destructive"
          );
        } else {
          addToast(
            `Built ${result.built} ${result.built === 1 ? "email" : "emails"}.`,
            "success"
          );
        }
        if (result.emptyGroups.length > 0) {
          addToast(
            `${result.emptyGroups.length} group${
              result.emptyGroups.length === 1 ? "" : "s"
            } skipped — nobody to send to: ${result.emptyGroups
              .map((g) => g.name)
              .join(", ")}`,
            "destructive"
          );
        }
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Couldn't build the groups.",
          "destructive"
        );
      }
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${mailing.title}”?`,
      description:
        "The draft, its groups and its record of what you've already sent all go. The emails you've already sent are unaffected.",
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await deleteMailing(mailing.id);
        router.push("/admin/mailings");
      } catch {
        addToast("Couldn't delete that.", "destructive");
      } finally {
        closeConfirm();
      }
    });
  };

  const reset = async () => {
    const ok = await confirm({
      title: "Clear the sent marks?",
      description:
        "Every group goes back to unsent so you can run this mailing again. The draft and the groups stay as they are.",
      confirmLabel: "Clear marks",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await resetMailingProgress(mailing.id);
        addToast("Ready to run again.", "success");
        router.refresh();
      } catch {
        addToast("Couldn't clear them.", "destructive");
      } finally {
        closeConfirm();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="max-w-lg text-lg font-semibold"
            aria-label="Mailing name"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.total === 0
              ? "No groups yet — choose who this goes to below."
              : `${progress.sent} of ${progress.total} marked sent.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {progress.sent > 0 && (
            <Button variant="ghost" onClick={reset} disabled={pending}>
              <RotateCcw className="h-4 w-4" />
              Clear marks
            </Button>
          )}
          <Button variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button onClick={save} disabled={pending || !dirty}>
            <Save className="h-4 w-4" />
            {dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="audience">Who it goes to</TabsTrigger>
          <TabsTrigger value="send">
            Send{progress.total > 0 ? ` (${progress.total})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="write" className="space-y-4">
          <div>
            <Label htmlFor="mailing-subject">Subject</Label>
            <Input
              id="mailing-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="{{group}} — room parent info for this year"
            />
          </div>

          <div>
            <Label>Message</Label>
            <SimpleRichTextEditor
              value={body}
              onChange={setBody}
              tools={[
                "bold",
                "italic",
                "underline",
                "heading",
                "paragraph",
                "bulletList",
                "numberedList",
                "link",
              ]}
              minHeightClass="min-h-[280px]"
              placeholder="Hi {{teacher_first_names}}, …"
            />
          </div>

          {unknown.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Nothing will fill in {unknown.map((v) => `{{${v}}}`).join(", ")} —
              it will appear in the email exactly as written. Check the list
              below for the spelling.
            </p>
          )}

          <VariableHelp />

          <AttachmentManager
            mailingId={mailing.id}
            attachments={attachments}
            rosterPresetId={rosterPresetId}
            rosterPresets={options.rosterPresets}
            onRosterPresetChange={setRosterPresetId}
          />
        </TabsContent>

        <TabsContent value="audience">
          <AudienceForm
            audience={audience}
            options={options}
            pending={pending}
            groupCount={groups.length}
            sentCount={progress.sent}
            onBuild={rebuild}
          />
        </TabsContent>

        <TabsContent value="send">
          <GroupList
            groups={groups}
            subjectTemplate={subject}
            bodyTemplate={body}
            dirty={dirty}
            rosterPresetId={rosterPresetId}
            attachments={attachments}
            senderName={senderName}
            onSave={save}
          />
        </TabsContent>
      </Tabs>

      {confirmDialog}
    </div>
  );
}
