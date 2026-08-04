import "server-only";
import { db } from "@/lib/db";
import {
  notifications,
  notificationPreferences,
  notificationSettings,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  NOTIFICATION_TYPES,
  type NotificationType,
  type NotificationTypeSpec,
} from "@/lib/constants";
import { sendPushPerUser, type PushPayload } from "@/lib/push";
import { getSchoolTimeZone } from "@/lib/school-time-zone";

/**
 * The one way anything in this app tells a person something happened.
 *
 * Every call site goes through here rather than touching `notifications` or
 * `push.ts` directly, because four decisions have to be made identically every
 * time and are easy to get subtly wrong in isolation: who is excluded, what
 * the recipient's preferences say, whether it collapses into an existing
 * unread row, and whether it is quiet hours. Spreading those across fourteen
 * call sites is how an app ends up pushing the poster their own message at
 * 11pm.
 *
 * Push is a delivery channel for an inbox row, not a parallel system. A user
 * with push off still accumulates inbox rows; a user with the *type* off gets
 * neither.
 *
 * **Call it from `after()`**, never inline:
 *
 * ```ts
 * await db.insert(committeeMessages).values({ ... });
 * after(() => notify({ ... }));
 * revalidatePath(`/committees/${committeeId}`);
 * ```
 *
 * APNs and FCM are third-party networks with third-party latency. A parent
 * pressing "Send" should not wait on them, and — more sharply — a waitlist
 * promotion must not be able to fail because Apple is having an afternoon.
 * `after()` runs post-response on Vercel's function lifecycle, and this
 * function additionally never throws (see the bottom of the file).
 */

export interface NotifyInput {
  type: NotificationType;
  schoolId: string;
  /**
   * User ids. Deduped, nullish dropped, `actorId` removed.
   *
   * Nullish entries are expected rather than defensive: `volunteer_signups`
   * and `committee_signups` both carry a nullable `user_id` by design — a seat
   * held by someone with no account is a real row — so recipient helpers
   * legitimately produce nulls.
   */
  recipients: (string | null | undefined)[];
  /** Who did the thing. Never notified about their own action. */
  actorId?: string | null;
  title: string;
  body: string;
  /** Relative in-app path. Anything else is dropped — see `safeUrl`. */
  url?: string;
  /**
   * Enables collapsing, e.g. `committee_message:<committeeId>`. An existing
   * *unread* row with the same key for the same user is rewritten in place
   * with a bumped count. Omit for one-off events that must never merge.
   */
  groupKey?: string;
}

/** Resolved delivery decision for one recipient. */
interface Resolved {
  userId: string;
  inApp: boolean;
  push: boolean;
}

/**
 * A notification `url` becomes a push payload the native shell navigates to.
 * An absolute URL there would let a notification move the WebView off-origin,
 * so only same-origin relative paths survive. `//evil.com` is a protocol-
 * relative URL and looks like a path if you only check the first character.
 */
function safeUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("/") || url.startsWith("//")) {
    console.warn(`notify(): dropping non-relative url ${JSON.stringify(url)}`);
    return null;
  }
  return url;
}

/**
 * Is `hour` inside the window that wraps midnight from `start` to `end`?
 *
 * Equal values mean the user has switched quiet hours off — the alternative
 * reading, a 24-hour blackout, is never what someone means by setting both
 * ends to the same time.
 */
function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** The current local hour in an IANA zone, without pulling in a date library. */
function hourInTimeZone(timeZone: string, now = new Date()): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = Number.parseInt(formatted, 10);
  // "24" is what some ICU versions render for midnight with hour12:false.
  return Number.isFinite(hour) ? hour % 24 : 12;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await runNotify(input);
  } catch (error) {
    // A message must post even when APNs is unreachable, and a waitlist
    // promotion must complete even when this table is unavailable. Nothing in
    // here is allowed to become the reason a write is lost.
    console.error(`notify(${input.type}) failed:`, error);
  }
}

async function runNotify(input: NotifyInput): Promise<void> {
  // Widened to the interface on purpose. `as const satisfies` gives each entry
  // a literal type in which the *optional* keys are simply absent, so reading
  // `spec.bypassQuietHours` off the union doesn't compile.
  const spec: NotificationTypeSpec | undefined = NOTIFICATION_TYPES[input.type];
  if (!spec) {
    console.error(`notify(): unknown type ${input.type}`);
    return;
  }

  // ── 1. Resolve the audience ───────────────────────────────────────────────
  const recipients = [
    ...new Set(input.recipients.filter((id): id is string => !!id)),
  ].filter((id) => id !== input.actorId);
  if (recipients.length === 0) return;

  // ── 2. Preferences ────────────────────────────────────────────────────────
  // Two indexed reads keyed on the recipient list, merged below, rather than
  // one query per recipient. Both tables are sparse on purpose — a missing row
  // means "use the defaults" — so this is a left join done in JavaScript, and
  // doing it here keeps the recipient ids as bound parameters instead of
  // interpolated SQL.
  const [prefRows, settingRows] = await Promise.all([
    db
      .select({
        userId: notificationPreferences.userId,
        inApp: notificationPreferences.inApp,
        push: notificationPreferences.push,
      })
      .from(notificationPreferences)
      .where(
        and(
          inArray(notificationPreferences.userId, recipients),
          eq(notificationPreferences.type, input.type)
        )
      ),
    db
      .select({
        userId: notificationSettings.userId,
        pushEnabled: notificationSettings.pushEnabled,
        quietStart: notificationSettings.quietHoursStart,
        quietEnd: notificationSettings.quietHoursEnd,
      })
      .from(notificationSettings)
      .where(inArray(notificationSettings.userId, recipients)),
  ]);

  const prefByUser = new Map(prefRows.map((r) => [r.userId, r]));
  const settingByUser = new Map(settingRows.map((r) => [r.userId, r]));

  const resolved: Resolved[] = [];
  const quietByUser = new Map<string, { start: number; end: number }>();
  for (const userId of recipients) {
    const pref = prefByUser.get(userId);
    const setting = settingByUser.get(userId);
    resolved.push({
      userId,
      inApp: pref?.inApp ?? spec.defaults.inApp,
      // The master switch and the per-type switch are AND-ed: turning push off
      // globally must beat a type the user once switched on.
      push: (pref?.push ?? spec.defaults.push) && (setting?.pushEnabled ?? true),
    });
    quietByUser.set(userId, {
      start: setting?.quietStart ?? 21,
      end: setting?.quietEnd ?? 7,
    });
  }

  const url = safeUrl(input.url);

  // ── 3. Inbox rows ─────────────────────────────────────────────────────────
  const inAppUsers = resolved.filter((r) => r.inApp).map((r) => r.userId);

  if (inAppUsers.length > 0) {
    const values = inAppUsers.map((userId) => ({
      userId,
      schoolId: input.schoolId,
      type: input.type,
      title: input.title,
      body: input.body,
      url,
      groupKey: input.groupKey ?? null,
      actorId: input.actorId ?? null,
    }));

    if (input.groupKey) {
      // Arbitrated by the partial unique index from migration 0070
      // (`(user_id, group_key) WHERE read_at IS NULL`). Collapsing therefore
      // only ever rewrites a row the recipient has *not* read: once they have
      // seen "3 new messages", the next post starts a fresh row instead of
      // silently editing one they already dismissed.
      await db
        .insert(notifications)
        .values(values)
        .onConflictDoUpdate({
          target: [notifications.userId, notifications.groupKey],
          targetWhere: and(
            isNull(notifications.readAt),
            sql`${notifications.groupKey} IS NOT NULL`
          ),
          set: {
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            url: sql`excluded.url`,
            actorId: sql`excluded.actor_id`,
            collapsedCount: sql`${notifications.collapsedCount} + 1`,
            // Bumped so the collapsed row rises back to the top of the feed —
            // it is news again.
            createdAt: sql`now()`,
          },
        });
    } else {
      await db.insert(notifications).values(values);
    }
  }

  // ── 4. Push filter ────────────────────────────────────────────────────────
  // Quiet hours are evaluated in the *school's* zone. A per-user zone is not
  // worth a column for an app whose whole audience lives in one catchment,
  // and the school's is the right answer for everyone in it.
  let currentHour: number | null = null;
  if (!spec.bypassQuietHours) {
    const timeZone = await getSchoolTimeZone(input.schoolId);
    currentHour = hourInTimeZone(timeZone);
  }

  const pushUsers = resolved
    .filter((r) => r.push)
    .filter((r) => {
      if (spec.bypassQuietHours || currentHour === null) return true;
      const q = quietByUser.get(r.userId)!;
      return !inQuietHours(currentHour, q.start, q.end);
    })
    .map((r) => r.userId);

  if (pushUsers.length === 0) return;

  // ── 5. Badge counts ───────────────────────────────────────────────────────
  // One grouped count over the push recipients. iOS shows this number on the
  // app icon, so it has to be *that reader's* unread total — not the size of
  // this send — which is why dispatch is per-user below.
  const counts = await db
    .select({
      userId: notifications.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(notifications)
    .where(
      and(
        inArray(notifications.userId, pushUsers),
        isNull(notifications.readAt)
      )
    )
    .groupBy(notifications.userId);

  const badgeByUser = new Map(counts.map((c) => [c.userId, c.count]));

  const payload: Omit<PushPayload, "badge"> = {
    title: input.title,
    body: input.body,
    url: url ?? undefined,
    channelId: spec.group,
    groupKey: input.groupKey,
  };

  // ── 6. Dispatch ───────────────────────────────────────────────────────────
  // `sendPushPerUser` batches identical payloads and prunes dead tokens.
  await sendPushPerUser(
    pushUsers.map((userId) => ({
      userId,
      payload: { ...payload, badge: badgeByUser.get(userId) ?? 0 },
    }))
  );
}
