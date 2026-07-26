"use server";

import {
  assertAuthenticated,
  assertSuperAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  feedback,
  feedbackMessages,
  schools,
  superAdmins,
  users,
} from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAppBaseUrl } from "@/lib/magic-link";
import {
  sendFeedbackReceivedEmail,
  sendFeedbackReplyEmail,
  sendFeedbackCompletedEmail,
  sendFeedbackMessageEmail,
} from "@/lib/email";

export type FeedbackType = "bug" | "improvement";
export type FeedbackStatus = "new" | "in_progress" | "completed" | "wont_do";

export interface FeedbackActionResult {
  success: boolean;
  error?: string;
}

/** Every super admin's email + display name — the recipients for feedback alerts. */
async function getSuperAdminRecipients(): Promise<
  { email: string; name: string | null }[]
> {
  return db
    .select({ email: users.email, name: users.name })
    .from(superAdmins)
    .innerJoin(users, eq(users.id, superAdmins.userId));
}

/** A best-effort email send that never blocks or fails the mutation it follows. */
async function notify(send: () => Promise<unknown>) {
  try {
    await send();
  } catch (err) {
    // Feedback is saved regardless of whether the notification goes out.
    console.error("Feedback notification failed:", err);
  }
}

/**
 * File a bug or improvement from the in-app widget. Any authenticated user may
 * submit; the current school is recorded for context only (and may be null for
 * a super admin with no membership).
 */
export async function submitFeedback(data: {
  type: FeedbackType;
  body: string;
  pageUrl: string;
  pageTitle?: string;
  dialogContext?: string;
  userAgent?: string;
  screenshotUrl?: string;
}): Promise<FeedbackActionResult> {
  const user = await assertAuthenticated();

  const body = data.body?.trim();
  if (!body) return { success: false, error: "Please describe your feedback." };
  if (data.type !== "bug" && data.type !== "improvement") {
    return { success: false, error: "Please choose a feedback type." };
  }

  const schoolId = await getCurrentSchoolId();

  const [row] = await db
    .insert(feedback)
    .values({
      schoolId: schoolId ?? null,
      userId: user.id!,
      type: data.type,
      body,
      pageUrl: data.pageUrl || "unknown",
      pageTitle: data.pageTitle || null,
      dialogContext: data.dialogContext || null,
      userAgent: data.userAgent || null,
      screenshotUrl: data.screenshotUrl || null,
    })
    .returning();

  const schoolName = schoolId
    ? (
        await db.query.schools.findFirst({
          where: eq(schools.id, schoolId),
          columns: { name: true },
        })
      )?.name ?? null
    : null;

  const recipients = await getSuperAdminRecipients();
  const ticketUrl = `${getAppBaseUrl()}/super-admin/feedback/${row.id}`;
  const submitterName = user.name || user.email || "A user";

  await notify(() =>
    Promise.all(
      recipients.map((r) =>
        sendFeedbackReceivedEmail({
          to: r.email,
          submitterName,
          type: data.type,
          body,
          pageUrl: data.pageUrl || "unknown",
          pageTitle: data.pageTitle,
          schoolName,
          url: ticketUrl,
        })
      )
    )
  );

  revalidatePath("/feedback");
  revalidatePath("/super-admin/feedback");
  return { success: true };
}

/** The submitter posts a reply on their own feedback thread. */
export async function replyToFeedbackAsUser(
  feedbackId: string,
  body: string
): Promise<FeedbackActionResult> {
  const user = await assertAuthenticated();

  const trimmed = body?.trim();
  if (!trimmed) return { success: false, error: "Message can't be empty." };

  const row = await db.query.feedback.findFirst({
    where: eq(feedback.id, feedbackId),
    columns: { id: true, userId: true },
  });
  if (!row) return { success: false, error: "Feedback not found." };
  if (row.userId !== user.id) {
    return { success: false, error: "You can only reply to your own feedback." };
  }

  await db.insert(feedbackMessages).values({
    feedbackId,
    authorId: user.id!,
    fromAdmin: false,
    body: trimmed,
  });

  const recipients = await getSuperAdminRecipients();
  const ticketUrl = `${getAppBaseUrl()}/super-admin/feedback/${feedbackId}`;
  const submitterName = user.name || user.email || "A user";

  await notify(() =>
    Promise.all(
      recipients.map((r) =>
        sendFeedbackReplyEmail({
          to: r.email,
          submitterName,
          message: trimmed,
          url: ticketUrl,
        })
      )
    )
  );

  revalidatePath("/feedback");
  revalidatePath(`/super-admin/feedback/${feedbackId}`);
  return { success: true };
}

/** Super admin moves a ticket through its workflow. Completing emails the submitter. */
export async function setFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus
): Promise<FeedbackActionResult> {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const row = await db.query.feedback.findFirst({
    where: eq(feedback.id, feedbackId),
    with: { submitter: { columns: { name: true, email: true } } },
  });
  if (!row) return { success: false, error: "Feedback not found." };

  const isCompleting = status === "completed" && row.status !== "completed";

  await db
    .update(feedback)
    .set({
      status,
      updatedAt: new Date(),
      resolvedAt: status === "completed" ? new Date() : null,
      resolvedBy: status === "completed" ? user.id! : null,
    })
    .where(eq(feedback.id, feedbackId));

  if (isCompleting && row.submitter?.email) {
    const url = `${getAppBaseUrl()}/feedback`;
    await notify(() =>
      sendFeedbackCompletedEmail({
        to: row.submitter!.email,
        name: row.submitter!.name,
        type: row.type,
        body: row.body,
        url,
      })
    );
  }

  revalidatePath("/super-admin/feedback");
  revalidatePath(`/super-admin/feedback/${feedbackId}`);
  revalidatePath("/feedback");
  return { success: true };
}

/** Super admin messages the submitter on a ticket, asking for detail. */
export async function replyToFeedbackAsAdmin(
  feedbackId: string,
  body: string
): Promise<FeedbackActionResult> {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const trimmed = body?.trim();
  if (!trimmed) return { success: false, error: "Message can't be empty." };

  const row = await db.query.feedback.findFirst({
    where: eq(feedback.id, feedbackId),
    with: { submitter: { columns: { name: true, email: true } } },
  });
  if (!row) return { success: false, error: "Feedback not found." };

  await db.insert(feedbackMessages).values({
    feedbackId,
    authorId: user.id!,
    fromAdmin: true,
    body: trimmed,
  });

  if (row.submitter?.email) {
    const url = `${getAppBaseUrl()}/feedback`;
    await notify(() =>
      sendFeedbackMessageEmail({
        to: row.submitter!.email,
        name: row.submitter!.name,
        message: trimmed,
        url,
      })
    );
  }

  revalidatePath("/super-admin/feedback");
  revalidatePath(`/super-admin/feedback/${feedbackId}`);
  revalidatePath("/feedback");
  return { success: true };
}

/** The current user's own feedback, newest first, with full message threads. */
export async function getMyFeedback() {
  const user = await assertAuthenticated();
  return db.query.feedback.findMany({
    where: eq(feedback.userId, user.id!),
    orderBy: [desc(feedback.createdAt)],
    with: {
      messages: {
        orderBy: (m, { asc }) => [asc(m.createdAt)],
      },
    },
  });
}
