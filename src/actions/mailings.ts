"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  committees,
  classrooms,
  mailingAttachments,
  mailingGroups,
  mailings,
} from "@/lib/db/schema";
import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { buildMailingGroups } from "@/lib/mail-merge-groups";
import {
  audienceProblems,
  DEFAULT_MAILING_AUDIENCE,
  type MailingAudience,
} from "@/lib/mail-merge-shared";
import { buildMemberExport } from "@/lib/member-export-data";
import {
  buildClassroomRosterFilters,
  classroomRosterInputForPreset,
  CLASSROOM_ROSTER_PRESETS,
} from "@/lib/classroom-roster-export";
import type { MemberExportResult } from "@/lib/member-export";

/**
 * Group mailings — the board's mail-merge tool.
 *
 * Every action here is PTA board only. The tool hands out contact details for
 * whole classrooms at a time, which is the board's to do and nobody else's; a
 * teacher who wants their own room's list has the classroom roster export.
 *
 * Nothing here sends email. See the `mailings` table comment for why.
 */

async function assertBoard() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  return { user, schoolId };
}

/** Load a mailing, proving it belongs to the caller's school before anything else. */
async function assertMailing(mailingId: string, schoolId: string) {
  const mailing = await db.query.mailings.findFirst({
    where: and(eq(mailings.id, mailingId), eq(mailings.schoolId, schoolId)),
  });
  if (!mailing) throw new Error("Mailing not found");
  return mailing;
}

function touch(mailingId: string) {
  revalidatePath("/admin/mailings");
  revalidatePath(`/admin/mailings/${mailingId}`);
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function listMailings() {
  const { schoolId } = await assertBoard();

  const rows = await db.query.mailings.findMany({
    where: eq(mailings.schoolId, schoolId),
    orderBy: [desc(mailings.updatedAt)],
    with: { groups: { columns: { id: true, sentAt: true } } },
  });

  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    status: m.status,
    updatedAt: m.updatedAt,
    groupCount: m.groups.length,
    sentCount: m.groups.filter((g) => g.sentAt).length,
  }));
}

export async function getMailing(mailingId: string) {
  const { schoolId } = await assertBoard();
  await assertMailing(mailingId, schoolId);

  const mailing = await db.query.mailings.findFirst({
    where: eq(mailings.id, mailingId),
    with: {
      groups: { orderBy: [asc(mailingGroups.sortOrder)] },
      attachments: { orderBy: [asc(mailingAttachments.createdAt)] },
    },
  });
  if (!mailing) throw new Error("Mailing not found");
  return mailing;
}

/**
 * The committees a mailing can be scoped to, and the rooms it can be limited
 * to. Both feed the audience form.
 */
export async function getMailingAudienceOptions() {
  const { schoolId } = await assertBoard();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const [committeeRows, classroomRows] = await Promise.all([
    db
      .select({
        id: committees.id,
        name: committees.name,
        perClassroomLimit: committees.perClassroomLimit,
      })
      .from(committees)
      .where(eq(committees.schoolId, schoolId))
      .orderBy(asc(committees.name)),
    db
      .select({
        id: classrooms.id,
        name: classrooms.name,
        gradeLevel: classrooms.gradeLevel,
        isDli: classrooms.isDli,
        active: classrooms.active,
        excludeFromSignup: classrooms.excludeFromSignup,
      })
      .from(classrooms)
      .where(
        and(
          eq(classrooms.schoolId, schoolId),
          eq(classrooms.schoolYear, schoolYear)
        )
      )
      .orderBy(asc(classrooms.name)),
  ]);

  return {
    committees: committeeRows,
    classrooms: classroomRows.filter(
      (c) => c.active !== false && !c.excludeFromSignup
    ),
    rosterPresets: CLASSROOM_ROSTER_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
    })),
  };
}

// ─── Writing ─────────────────────────────────────────────────────────────────

export async function createMailing(title: string) {
  const { user, schoolId } = await assertBoard();
  const clean = title.trim();
  if (!clean) throw new Error("Give the mailing a name");

  const [created] = await db
    .insert(mailings)
    .values({
      schoolId,
      title: clean,
      audience: DEFAULT_MAILING_AUDIENCE,
      createdBy: user.id!,
    })
    .returning({ id: mailings.id });

  revalidatePath("/admin/mailings");
  return created.id;
}

export async function updateMailing(
  mailingId: string,
  patch: {
    title?: string;
    subjectTemplate?: string;
    bodyTemplate?: string;
    rosterPresetId?: string | null;
    status?: "draft" | "sending" | "done";
  }
) {
  const { schoolId } = await assertBoard();
  await assertMailing(mailingId, schoolId);

  await db
    .update(mailings)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.subjectTemplate !== undefined
        ? { subjectTemplate: patch.subjectTemplate }
        : {}),
      ...(patch.bodyTemplate !== undefined
        ? { bodyTemplate: patch.bodyTemplate }
        : {}),
      ...(patch.rosterPresetId !== undefined
        ? { rosterPresetId: patch.rosterPresetId }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(mailings.id, mailingId));

  touch(mailingId);
}

export async function deleteMailing(mailingId: string) {
  const { schoolId } = await assertBoard();
  await assertMailing(mailingId, schoolId);
  await db.delete(mailings).where(eq(mailings.id, mailingId));
  revalidatePath("/admin/mailings");
}

/**
 * Rebuild the group list from current signups.
 *
 * **`sent_at` survives for any group whose key is unchanged.** That is the
 * whole reason groups are stored rather than derived: someone works down thirty
 * rooms across two sittings, and three parents sign up in between. Rebuilding
 * must not tell them they have sent nothing.
 *
 * A group that no longer matches the audience is deleted even if it was marked
 * sent — it is gone from the audience, and leaving it would imply it still
 * needs an email. Groups that were sent and still match keep their mark.
 */
export async function rebuildMailingGroups(
  mailingId: string,
  audience: MailingAudience
) {
  const { user, schoolId } = await assertBoard();
  await assertMailing(mailingId, schoolId);

  const problems = audienceProblems(audience);
  if (problems.length > 0) throw new Error(problems[0]);

  const { groups, emptyGroups } = await buildMailingGroups({
    schoolId,
    audience,
    senderName: user.name ?? "",
  });

  const existing = await db
    .select({
      groupKey: mailingGroups.groupKey,
      sentAt: mailingGroups.sentAt,
      sentBy: mailingGroups.sentBy,
      note: mailingGroups.note,
    })
    .from(mailingGroups)
    .where(eq(mailingGroups.mailingId, mailingId));
  const previous = new Map(existing.map((g) => [g.groupKey, g]));

  await db.transaction(async (tx) => {
    await tx.delete(mailingGroups).where(eq(mailingGroups.mailingId, mailingId));

    if (groups.length > 0) {
      await tx.insert(mailingGroups).values(
        groups.map((g) => {
          const prior = previous.get(g.groupKey);
          return {
            mailingId,
            groupKey: g.groupKey,
            name: g.name,
            classroomIds: g.classroomIds,
            recipients: g.recipients,
            variables: g.variables,
            // A note is written by hand about this group, so it outlives a
            // rebuild for the same reason `sent_at` does.
            note: prior?.note ?? null,
            sortOrder: g.sortOrder,
            sentAt: prior?.sentAt ?? null,
            sentBy: prior?.sentBy ?? null,
          };
        })
      );
    }

    await tx
      .update(mailings)
      .set({ audience, updatedAt: new Date() })
      .where(eq(mailings.id, mailingId));
  });

  touch(mailingId);
  return { built: groups.length, emptyGroups };
}

export async function updateMailingGroupNote(groupId: string, note: string) {
  const { schoolId } = await assertBoard();
  const group = await db.query.mailingGroups.findFirst({
    where: eq(mailingGroups.id, groupId),
  });
  if (!group) throw new Error("Group not found");
  await assertMailing(group.mailingId, schoolId);

  await db
    .update(mailingGroups)
    .set({ note: note.trim() || null })
    .where(eq(mailingGroups.id, groupId));

  touch(group.mailingId);
}

/**
 * Tick a group off, or un-tick it.
 *
 * This records that a board member says they sent it. DragonHub did not send
 * it and cannot know — every surface that shows this says "marked sent" rather
 * than "sent" for that reason.
 */
export async function setMailingGroupSent(groupId: string, sent: boolean) {
  const { user, schoolId } = await assertBoard();
  const group = await db.query.mailingGroups.findFirst({
    where: eq(mailingGroups.id, groupId),
  });
  if (!group) throw new Error("Group not found");
  const mailing = await assertMailing(group.mailingId, schoolId);

  await db
    .update(mailingGroups)
    .set({
      sentAt: sent ? new Date() : null,
      sentBy: sent ? user.id! : null,
    })
    .where(eq(mailingGroups.id, groupId));

  // Moving off `draft` on the first tick means the index can show progress
  // without every row counting its own groups.
  if (sent && mailing.status === "draft") {
    await db
      .update(mailings)
      .set({ status: "sending", updatedAt: new Date() })
      .where(eq(mailings.id, mailing.id));
  }

  touch(group.mailingId);
}

/** Clear every tick, so the same mailing can be run again next term. */
export async function resetMailingProgress(mailingId: string) {
  const { schoolId } = await assertBoard();
  await assertMailing(mailingId, schoolId);

  await db
    .update(mailingGroups)
    .set({ sentAt: null, sentBy: null })
    .where(eq(mailingGroups.mailingId, mailingId));
  await db
    .update(mailings)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(mailings.id, mailingId));

  touch(mailingId);
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export async function addMailingAttachment(
  mailingId: string,
  file: { fileName: string; blobUrl: string; fileSize?: number; contentType?: string }
) {
  const { user, schoolId } = await assertBoard();
  await assertMailing(mailingId, schoolId);

  await db.insert(mailingAttachments).values({
    mailingId,
    fileName: file.fileName,
    blobUrl: file.blobUrl,
    fileSize: file.fileSize ?? null,
    contentType: file.contentType ?? null,
    uploadedBy: user.id!,
  });

  touch(mailingId);
}

export async function removeMailingAttachment(attachmentId: string) {
  const { schoolId } = await assertBoard();
  const attachment = await db.query.mailingAttachments.findFirst({
    where: eq(mailingAttachments.id, attachmentId),
  });
  if (!attachment) throw new Error("Attachment not found");
  await assertMailing(attachment.mailingId, schoolId);

  await db
    .delete(mailingAttachments)
    .where(eq(mailingAttachments.id, attachmentId));

  touch(attachment.mailingId);
}

/**
 * The roster spreadsheet for one group, built from the same code as the
 * classroom roster export.
 *
 * A group can cover more than one room — a DLI grade covers two — so this is
 * the union of its rooms rather than a single-classroom export. It goes through
 * `buildClassroomRosterFilters` per room so the column clamping stays in one
 * place; the rows are concatenated and the shared columns come from the first.
 */
export async function exportMailingGroupRoster(
  groupId: string,
  presetId: string
): Promise<MemberExportResult & { fileName: string }> {
  const { schoolId } = await assertBoard();
  const group = await db.query.mailingGroups.findFirst({
    where: eq(mailingGroups.id, groupId),
  });
  if (!group) throw new Error("Group not found");
  await assertMailing(group.mailingId, schoolId);

  const preset =
    CLASSROOM_ROSTER_PRESETS.find((p) => p.id === presetId) ??
    CLASSROOM_ROSTER_PRESETS[0];
  const input = classroomRosterInputForPreset(preset);

  const roomIds = group.classroomIds ?? [];
  if (roomIds.length === 0) {
    throw new Error(`${group.name} has no classrooms to build a roster from.`);
  }

  // Confirm every room is this school's before exporting any of it. The ids
  // come from a row we just authorized, but the check is cheap and the failure
  // mode — one school's roster inside another's mailing — is not.
  const rooms = await db
    .select({ id: classrooms.id, name: classrooms.name })
    .from(classrooms)
    .where(
      and(inArray(classrooms.id, roomIds), eq(classrooms.schoolId, schoolId))
    );
  if (rooms.length !== roomIds.length) {
    throw new Error("That group refers to a classroom outside this school.");
  }

  // Every room is exported with identical filters, so the columns and the
  // year-context flags are the same across them; only rows and emails
  // accumulate. Merging on the first result keeps that explicit rather than
  // rebuilding a `MemberExportResult` by hand and drifting from its shape.
  let merged: MemberExportResult | null = null;
  const emails = new Set<string>();
  for (const room of rooms) {
    const result = await buildMemberExport(
      schoolId,
      buildClassroomRosterFilters(room.id, input)
    );
    result.emails.forEach((e) => emails.add(e));
    if (!merged) {
      merged = { ...result, rows: [...result.rows] };
    } else {
      merged.rows.push(...result.rows);
      merged.memberCount += result.memberCount;
    }
  }
  if (!merged) throw new Error("That group has no classrooms to export.");

  return {
    ...merged,
    emails: [...emails],
    // A person on both halves of a DLI grade was counted once per room above.
    memberCount: emails.size,
    fileName: `${group.name.replace(/[^\w\s-]/g, "").trim() || "roster"} roster`,
  };
}
