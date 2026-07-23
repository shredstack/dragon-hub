/**
 * The weekly committee activity digest.
 *
 * A committee message board nobody checks is worse than no message board. This
 * summarizes the week so a committee stays alive without asking anyone to visit
 * the app — and, crucially, looks forward: the tasks due in the next seven days
 * are the reason to open it.
 *
 * Two rules shape everything below:
 *
 *   1. A committee with no activity and nothing upcoming is skipped entirely.
 *      An empty digest trains people to ignore the next one.
 *   2. One email per person per week, covering all their committees. A parent
 *      on three committees gets one message with three sections, not three.
 */

import { db } from "@/lib/db";
import {
  committeeMembers,
  committeeMessages,
  committees,
  committeeSignups,
  committeeTasks,
  emailPreferences,
  users,
} from "@/lib/db/schema";
import { and, asc, eq, gt, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendCommitteeDigestEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/magic-link";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DigestTask {
  title: string;
  dueDate: Date | null;
  assigneeName: string | null;
}

export interface DigestCommitteeSection {
  committeeName: string;
  committeeUrl: string;
  newMessages: Array<{ author: string; excerpt: string }>;
  /** How many messages beyond the three shown. */
  extraMessageCount: number;
  tasksCreated: string[];
  tasksCompleted: string[];
  tasksDueSoon: DigestTask[];
  newMembers: string[];
  promotedMembers: string[];
  /** "We still need 3 more volunteers", with the join link. Null when staffed. */
  stillNeeded: number | null;
  joinUrl: string | null;
}

/** ~140 characters, cut on a word boundary so it doesn't end mid-word. */
function excerpt(message: string, limit = 140): string {
  const flat = message.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Everything worth reporting for one committee over its own window.
 *
 * Returns null when there's nothing to say — which is what rule 1 above is
 * enforced by, rather than a check at the call site that could drift.
 */
async function buildSection(committee: {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  minSize: number | null;
  lastDigestSentAt: Date | null;
}): Promise<DigestCommitteeSection | null> {
  const now = new Date();
  // The window starts at the last send, not a fixed seven days back, so a
  // retried or delayed run reports each item exactly once. Capped at a week so
  // a committee that's been quiet for a month doesn't dump its whole history.
  const since = new Date(
    Math.max(committee.lastDigestSentAt?.getTime() ?? 0, now.getTime() - WEEK_MS)
  );
  const dueBefore = new Date(now.getTime() + WEEK_MS);
  const baseUrl = getAppBaseUrl();

  const [messages, tasks, dueSoon, signups] = await Promise.all([
    db
      .select({
        message: committeeMessages.message,
        createdAt: committeeMessages.createdAt,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(committeeMessages)
      .leftJoin(users, eq(committeeMessages.authorId, users.id))
      .where(
        and(
          eq(committeeMessages.committeeId, committee.id),
          gt(committeeMessages.createdAt, since),
          // Chairs-only posts stay off a digest that goes to every member.
          eq(committeeMessages.chairsOnly, false)
        )
      )
      .orderBy(asc(committeeMessages.createdAt)),
    db.query.committeeTasks.findMany({
      where: and(
        eq(committeeTasks.committeeId, committee.id),
        gt(committeeTasks.createdAt, since)
      ),
      columns: { title: true, completed: true },
    }),
    db
      .select({
        title: committeeTasks.title,
        dueDate: committeeTasks.dueDate,
        assigneeName: users.name,
      })
      .from(committeeTasks)
      .leftJoin(users, eq(committeeTasks.assignedTo, users.id))
      .where(
        and(
          eq(committeeTasks.committeeId, committee.id),
          eq(committeeTasks.completed, false),
          gte(committeeTasks.dueDate, now),
          lte(committeeTasks.dueDate, dueBefore)
        )
      )
      .orderBy(asc(committeeTasks.dueDate)),
    db.query.committeeSignups.findMany({
      where: and(
        eq(committeeSignups.committeeId, committee.id),
        eq(committeeSignups.status, "active")
      ),
      columns: {
        name: true,
        createdAt: true,
        promotedAt: true,
      },
    }),
  ]);

  const newMembers = signups
    .filter((s) => s.createdAt && s.createdAt > since && !s.promotedAt)
    .map((s) => s.name);
  const promotedMembers = signups
    .filter((s) => s.promotedAt && s.promotedAt > since)
    .map((s) => s.name);

  const memberCount = signups.length;
  const stillNeeded =
    committee.minSize && memberCount < committee.minSize
      ? committee.minSize - memberCount
      : null;

  // Recruiting is the digest's second job, so an under-staffed committee is
  // reason enough to send even when the week was otherwise quiet — but only
  // while its join link actually works.
  const isRecruiting = committee.status === "active" && stillNeeded !== null;

  const hasContent =
    messages.length > 0 ||
    tasks.length > 0 ||
    dueSoon.length > 0 ||
    newMembers.length > 0 ||
    promotedMembers.length > 0 ||
    isRecruiting;
  if (!hasContent) return null;

  return {
    committeeName: committee.name,
    committeeUrl: baseUrl ? `${baseUrl}/committees/${committee.id}` : "",
    newMessages: messages.slice(0, 3).map((m) => ({
      author: m.authorName ?? m.authorEmail ?? "Someone",
      excerpt: excerpt(m.message),
    })),
    extraMessageCount: Math.max(0, messages.length - 3),
    tasksCreated: tasks.filter((t) => !t.completed).map((t) => t.title),
    tasksCompleted: tasks.filter((t) => t.completed).map((t) => t.title),
    tasksDueSoon: dueSoon,
    newMembers,
    promotedMembers,
    stillNeeded: isRecruiting ? stillNeeded : null,
    joinUrl:
      isRecruiting && baseUrl ? `${baseUrl}/committee/${committee.joinCode}` : null,
  };
}

/**
 * Reads (or lazily creates) someone's email preferences.
 *
 * An absent row means opted in, so nothing needed a backfill — but the token
 * has to exist before the email is sent, since it's what makes the unsubscribe
 * link work without a sign-in.
 */
async function resolvePreferences(userId: string) {
  const existing = await db.query.emailPreferences.findFirst({
    where: eq(emailPreferences.userId, userId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(emailPreferences)
    .values({ userId, unsubscribeToken: randomBytes(24).toString("base64url") })
    .onConflictDoNothing()
    .returning();

  // A concurrent send may have won the insert; re-read rather than assume.
  return (
    created ??
    (await db.query.emailPreferences.findFirst({
      where: eq(emailPreferences.userId, userId),
    }))
  );
}

export interface DigestResult {
  committeesScanned: number;
  emailsSent: number;
  recipientsSkipped: number;
}

/**
 * One pass over every active, digest-enabled committee.
 *
 * `lastDigestSentAt` is stamped once per committee after the sends, so a second
 * cron run the same day finds an empty window and sends nothing.
 */
export async function sendCommitteeDigests(): Promise<DigestResult> {
  const active = await db.query.committees.findMany({
    where: and(
      isNull(committees.archivedAt),
      eq(committees.digestEnabled, true),
      ne(committees.status, "draft")
    ),
    columns: {
      id: true,
      name: true,
      joinCode: true,
      status: true,
      minSize: true,
      lastDigestSentAt: true,
      schoolId: true,
    },
    with: { school: { columns: { name: true } } },
  });

  if (active.length === 0) {
    return { committeesScanned: 0, emailsSent: 0, recipientsSkipped: 0 };
  }

  // committeeId → its section, for the committees that have something to say.
  const sections = new Map<string, DigestCommitteeSection>();
  const schoolNames = new Map<string, string>();
  for (const committee of active) {
    const section = await buildSection(committee);
    if (section) {
      sections.set(committee.id, section);
      schoolNames.set(committee.id, committee.school?.name ?? "Your school");
    }
  }

  if (sections.size === 0) {
    return {
      committeesScanned: active.length,
      emailsSent: 0,
      recipientsSkipped: 0,
    };
  }

  // Fan the sections out to people, then back in: one email per recipient
  // covering every committee they're on.
  const memberships = await db
    .select({
      userId: committeeMembers.userId,
      committeeId: committeeMembers.committeeId,
      name: users.name,
      email: users.email,
    })
    .from(committeeMembers)
    .innerJoin(users, eq(committeeMembers.userId, users.id))
    .where(inArray(committeeMembers.committeeId, [...sections.keys()]));

  const byRecipient = new Map<
    string,
    { name: string | null; email: string; committeeIds: string[] }
  >();
  for (const row of memberships) {
    if (!row.email) continue;
    const entry = byRecipient.get(row.userId);
    if (entry) {
      entry.committeeIds.push(row.committeeId);
    } else {
      byRecipient.set(row.userId, {
        name: row.name,
        email: row.email,
        committeeIds: [row.committeeId],
      });
    }
  }

  let emailsSent = 0;
  let recipientsSkipped = 0;

  for (const [userId, recipient] of byRecipient) {
    const prefs = await resolvePreferences(userId);
    if (!prefs || !prefs.committeeDigest) {
      recipientsSkipped += 1;
      continue;
    }

    const theirSections = recipient.committeeIds
      .map((id) => sections.get(id))
      .filter((s): s is DigestCommitteeSection => !!s);
    if (theirSections.length === 0) {
      recipientsSkipped += 1;
      continue;
    }

    const baseUrl = getAppBaseUrl();
    try {
      await sendCommitteeDigestEmail({
        to: recipient.email,
        name: recipient.name,
        schoolName: schoolNames.get(recipient.committeeIds[0]) ?? "Your school",
        sections: theirSections,
        unsubscribeUrl: baseUrl
          ? `${baseUrl}/email-preferences/${prefs.unsubscribeToken}`
          : "",
      });
      emailsSent += 1;
    } catch (error) {
      console.error(`Committee digest failed for ${recipient.email}:`, error);
      // One bad address must not stop the rest of the run.
    }
  }

  // Stamped after the sends, so a crash mid-run leaves the window open and the
  // next run repeats rather than silently dropping a week.
  await db
    .update(committees)
    .set({ lastDigestSentAt: new Date() })
    .where(inArray(committees.id, [...sections.keys()]));

  return {
    committeesScanned: active.length,
    emailsSent,
    recipientsSkipped,
  };
}

/** Used by the unsubscribe page, which has a token and no session. */
export async function findPreferencesByToken(token: string) {
  return db.query.emailPreferences.findFirst({
    where: eq(emailPreferences.unsubscribeToken, token),
  });
}

export async function setCommitteeDigestPreference(
  token: string,
  enabled: boolean
): Promise<boolean> {
  const prefs = await findPreferencesByToken(token);
  if (!prefs) return false;

  await db
    .update(emailPreferences)
    .set({ committeeDigest: enabled, updatedAt: new Date() })
    .where(eq(emailPreferences.userId, prefs.userId));
  return true;
}

/**
 * The signed-in path, for the toggle on /profile. Creates the row (and its
 * token) on first use, same as the digest does.
 */
export async function setCommitteeDigestPreferenceForUser(
  userId: string,
  enabled: boolean
): Promise<void> {
  await resolvePreferences(userId);
  await db
    .update(emailPreferences)
    .set({ committeeDigest: enabled, updatedAt: new Date() })
    .where(eq(emailPreferences.userId, userId));
}

export async function getCommitteeDigestPreference(
  userId: string
): Promise<boolean> {
  const prefs = await db.query.emailPreferences.findFirst({
    where: eq(emailPreferences.userId, userId),
    columns: { committeeDigest: true },
  });
  // Absent row means opted in.
  return prefs?.committeeDigest ?? true;
}

