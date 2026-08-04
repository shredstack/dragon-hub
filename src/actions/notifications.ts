"use server";

import { db } from "@/lib/db";
import {
  notifications,
  notificationPreferences,
  notificationSettings,
  pushTokens,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
  getSchoolAccess,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import { DEFAULT_TIME_ZONE } from "@/lib/time-zone";
import {
  NOTIFICATION_TYPES,
  isNotificationType,
  type NotificationType,
} from "@/lib/constants";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { revalidatePath } from "next/cache";

/**
 * Reading and configuring your own notifications.
 *
 * The rule running through every function here: **filter by
 * `session.user.id`, not just by row id.** A notification id is a UUID, but
 * "hard to guess" is not an authorization model, and the failure mode of
 * getting it wrong is quiet — marking someone else's notification read hides
 * it from them with no trace and no error.
 */

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  collapsedCount: number;
  readAt: Date | null;
  createdAt: Date;
}

export async function getNotifications(opts?: {
  limit?: number;
  /** Cursor: return rows strictly older than this. */
  before?: Date;
}): Promise<NotificationRow[]> {
  const user = await assertAuthenticated();
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);

  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      collapsedCount: notifications.collapsedCount,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id!),
        opts?.before ? lt(notifications.createdAt, opts.before) : undefined
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCount(): Promise<number> {
  const user = await assertAuthenticated();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, user.id!), isNull(notifications.readAt))
    );
  return row?.count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  const user = await assertAuthenticated();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, user.id!),
        isNull(notifications.readAt)
      )
    );
  revalidatePath("/notifications");
}

export async function markAllRead(): Promise<void> {
  const user = await assertAuthenticated();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, user.id!), isNull(notifications.readAt))
    );
  revalidatePath("/notifications");
}

// ─── Preferences ────────────────────────────────────────────────────────────

export interface MyNotificationSettings {
  pushEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  /** Named in the UI copy, so "9pm" is unambiguous. */
  timeZone: string;
  /** Sparse: only types the user has actually overridden. */
  overrides: Record<string, { inApp: boolean; push: boolean }>;
  /** Whether to offer the `boardOnly` types at all. */
  isBoard: boolean;
}

export async function getMyNotificationSettings(): Promise<MyNotificationSettings> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  const access = await getSchoolAccess(user.id!, schoolId);

  const [settings, prefs, timeZone, isBoard] = await Promise.all([
    db.query.notificationSettings.findFirst({
      where: eq(notificationSettings.userId, user.id!),
    }),
    db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id!)),
    access?.schoolId
      ? getSchoolTimeZone(access.schoolId)
      : Promise.resolve(DEFAULT_TIME_ZONE),
    access?.schoolId
      ? isPtaBoardMember(user.id!, access.schoolId)
      : Promise.resolve(false),
  ]);

  return {
    pushEnabled: settings?.pushEnabled ?? true,
    quietHoursStart: settings?.quietHoursStart ?? 21,
    quietHoursEnd: settings?.quietHoursEnd ?? 7,
    timeZone,
    overrides: Object.fromEntries(
      prefs.map((p) => [p.type, { inApp: p.inApp, push: p.push }])
    ),
    isBoard,
  };
}

/**
 * Flip one channel of one type.
 *
 * Writes both channels because the row's primary key covers both columns and
 * they are NOT NULL: setting only `push` would need the current `inApp`, and
 * reading it first opens a lost-update window between two switches toggled in
 * quick succession. The caller sends the pair it is showing.
 */
export async function updateNotificationSetting(
  type: string,
  values: { inApp: boolean; push: boolean }
): Promise<void> {
  const user = await assertAuthenticated();
  if (!isNotificationType(type)) throw new Error("Unknown notification type");

  await db
    .insert(notificationPreferences)
    .values({
      userId: user.id!,
      type,
      inApp: values.inApp,
      push: values.push,
    })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: {
        inApp: values.inApp,
        push: values.push,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/profile");
}

export async function setPushEnabled(value: boolean): Promise<void> {
  const user = await assertAuthenticated();
  await upsertSettings(user.id!, { pushEnabled: value });
}

export async function updateQuietHours(
  start: number,
  end: number
): Promise<void> {
  const user = await assertAuthenticated();
  const clamp = (h: number) =>
    Number.isInteger(h) && h >= 0 && h <= 23 ? h : 0;
  await upsertSettings(user.id!, {
    quietHoursStart: clamp(start),
    quietHoursEnd: clamp(end),
  });
}

async function upsertSettings(
  userId: string,
  patch: Partial<{
    pushEnabled: boolean;
    quietHoursStart: number;
    quietHoursEnd: number;
  }>
) {
  await db
    .insert(notificationSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: notificationSettings.userId,
      set: { ...patch, updatedAt: new Date() },
    });
  revalidatePath("/profile");
}

/**
 * Back to defaults — by **deleting** the user's rows, not by writing the
 * current default values into them.
 *
 * The difference matters later: a sparse table means a change to a type's
 * `defaults` in NOTIFICATION_TYPES reaches everyone who never touched that
 * switch. Writing the values would freeze today's defaults into their account
 * forever, and "reset to defaults" would be the one action that opts you out
 * of future defaults.
 */
export async function resetNotificationPreferences(): Promise<void> {
  const user = await assertAuthenticated();
  await db
    .delete(notificationPreferences)
    .where(eq(notificationPreferences.userId, user.id!));
  await db
    .delete(notificationSettings)
    .where(eq(notificationSettings.userId, user.id!));
  revalidatePath("/profile");
}

export interface MyDevice {
  id: string;
  token: string;
  platform: "ios" | "android";
  deviceName: string | null;
  appVersion: string | null;
  lastSeenAt: Date;
}

export async function getMyDevices(): Promise<MyDevice[]> {
  const user = await assertAuthenticated();
  return db
    .select({
      id: pushTokens.id,
      token: pushTokens.token,
      platform: pushTokens.platform,
      deviceName: pushTokens.deviceName,
      appVersion: pushTokens.appVersion,
      lastSeenAt: pushTokens.lastSeenAt,
    })
    .from(pushTokens)
    .where(eq(pushTokens.userId, user.id!))
    .orderBy(desc(pushTokens.lastSeenAt));
}

// ─── Announcements (§B.4) ───────────────────────────────────────────────────

export type AnnouncementAudience =
  | { kind: "everyone" }
  | { kind: "board" }
  | { kind: "committee"; id: string }
  | { kind: "classroom"; id: string };

export async function previewAnnouncementRecipients(
  audience: AnnouncementAudience
): Promise<{ people: number; devices: number }> {
  const user = await assertAuthenticated();
  const schoolId = await requireBoardSchool(user.id!);
  const { resolveAnnouncementRecipients } = await import(
    "@/lib/notify-recipients"
  );
  const recipients = await resolveAnnouncementRecipients(schoolId, audience);
  if (recipients.length === 0) return { people: 0, devices: 0 };

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, recipients));

  return { people: recipients.length, devices: row?.count ?? 0 };
}

export async function sendAnnouncement(input: {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  url?: string;
}): Promise<{ sent: number }> {
  const user = await assertAuthenticated();
  const schoolId = await requireBoardSchool(user.id!);

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("An announcement needs a title.");
  if (!body) throw new Error("An announcement needs a message.");

  // A broadcast button with no ceiling is one misclick away from every parent
  // at the school muting the app. Per school, not per user: the limit is about
  // how much the *audience* can be asked to absorb.
  const { checkRateLimit, RATE_LIMITS, rateLimitMessage } = await import(
    "@/lib/rate-limit"
  );
  const limit = await checkRateLimit(
    RATE_LIMITS.announcementPerSchool,
    schoolId
  );
  if (!limit.ok) throw new Error(rateLimitMessage(limit));

  const { resolveAnnouncementRecipients } = await import(
    "@/lib/notify-recipients"
  );
  const recipients = await resolveAnnouncementRecipients(
    schoolId,
    input.audience
  );
  if (recipients.length === 0) {
    throw new Error("That audience has nobody in it right now.");
  }

  // Awaited rather than deferred to `after()`: this action's whole job is the
  // send, and the board member pressing the button is owed a real count back.
  const { notify } = await import("@/lib/notify");
  await notify({
    type: "announcement",
    schoolId,
    recipients,
    actorId: user.id!,
    title,
    body,
    url: input.url ?? "/notifications",
  });

  revalidatePath("/admin/announcements");
  return { sent: recipients.length };
}

/** Recent announcements, so the board can see what actually went out. */
export async function getSentAnnouncements(): Promise<
  Array<{ title: string; body: string; sentAt: Date; recipients: number }>
> {
  const user = await assertAuthenticated();
  const schoolId = await requireBoardSchool(user.id!);

  // Announcements fan out to one row per recipient, so the sent list is a
  // grouping over them. `date_trunc` to the second collapses one send whose
  // inserts straddled a clock tick.
  const rows = await db
    .select({
      title: notifications.title,
      body: notifications.body,
      sentAt: sql<Date>`date_trunc('second', min(${notifications.createdAt}))`,
      recipients: sql<number>`count(*)::int`,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.schoolId, schoolId),
        eq(notifications.type, "announcement")
      )
    )
    .groupBy(
      notifications.title,
      notifications.body,
      sql`date_trunc('second', ${notifications.createdAt})`
    )
    .orderBy(sql`min(${notifications.createdAt}) desc`)
    .limit(25);

  return rows.map((r) => ({ ...r, sentAt: new Date(r.sentAt) }));
}

async function requireBoardSchool(userId: string): Promise<string> {
  const schoolId = await getCurrentSchoolId();
  const access = await getSchoolAccess(userId, schoolId);
  if (!access?.schoolId) throw new Error("No school in scope");
  await assertPtaBoardMember(userId, access.schoolId);
  return access.schoolId;
}

/** The full taxonomy, for the preferences UI. Server-rendered to keep it in one place. */
export async function getNotificationTaxonomy(): Promise<
  Array<{
    type: NotificationType;
    label: string;
    description: string;
    group: string;
    defaults: { inApp: boolean; push: boolean };
    boardOnly: boolean;
  }>
> {
  return Object.entries(NOTIFICATION_TYPES).map(([type, spec]) => ({
    type: type as NotificationType,
    label: spec.label,
    description: spec.description,
    group: spec.group,
    defaults: { ...spec.defaults },
    boardOnly: "boardOnly" in spec ? !!spec.boardOnly : false,
  }));
}
