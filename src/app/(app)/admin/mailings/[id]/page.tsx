import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getMailing, getMailingAudienceOptions } from "@/actions/mailings";
import { DEFAULT_MAILING_AUDIENCE } from "@/lib/mail-merge-shared";
import { MailingEditor } from "./mailing-editor";

export const metadata = { title: "Group Mailing" };

export default async function MailingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);
  if (!(await getCurrentSchoolId())) return null;

  let mailing;
  try {
    mailing = await getMailing(id);
  } catch {
    notFound();
  }

  const options = await getMailingAudienceOptions();

  return (
    <MailingEditor
      mailing={{
        id: mailing.id,
        title: mailing.title,
        subjectTemplate: mailing.subjectTemplate,
        bodyTemplate: mailing.bodyTemplate,
        rosterPresetId: mailing.rosterPresetId,
        // Null and "" mean the same thing to the form, which is a controlled
        // input and cannot hold null.
        relayTo: mailing.relayTo ?? "",
        relayName: mailing.relayName ?? "",
        status: mailing.status,
        audience: mailing.audience ?? DEFAULT_MAILING_AUDIENCE,
      }}
      groups={mailing.groups.map((g) => ({
        id: g.id,
        groupKey: g.groupKey,
        name: g.name,
        classroomIds: g.classroomIds ?? [],
        recipients: g.recipients ?? [],
        variables: g.variables ?? {},
        note: g.note,
        sortOrder: g.sortOrder,
        sentAt: g.sentAt,
      }))}
      attachments={mailing.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        blobUrl: a.blobUrl,
        fileSize: a.fileSize,
      }))}
      options={options}
      senderName={session.user.name ?? ""}
    />
  );
}
