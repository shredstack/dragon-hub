import "server-only";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { notify } from "@/lib/notify";
import { extractMentions } from "@/lib/mentions";
import type { NotificationType } from "@/lib/constants";

/**
 * A message posted to a board, with mentions split out.
 *
 * All three message boards (classroom, committee, event plan) want the same
 * shape, and the interesting rule is the split: **someone who was mentioned
 * gets a `mention` INSTEAD OF the board's `*_message` type, never in addition.**
 * Two notifications for one post is the fastest way to get push turned off for
 * everything, and the mention is strictly the more informative of the two.
 *
 * The mention candidates are the message's own recipients — already filtered
 * for `room_parents_only` / `chairsOnly` by the caller — so `@Someone` can only
 * ever reach a person who could open the thread anyway. Do not widen that list
 * to "everyone at the school"; the notification body quotes the message.
 */
export async function notifyMessagePosted(params: {
  type: Extract<
    NotificationType,
    "classroom_message" | "committee_message" | "event_plan_message"
  >;
  schoolId: string;
  /** Everyone allowed to read this post. */
  recipients: string[];
  actorId: string;
  /** "Yearbook Committee" — the board's name, used as the title. */
  contextName: string;
  /** The message text. Used for the preview and for mention matching. */
  message: string;
  /** Relative path to the thread. */
  url: string;
  /** Collapse key for the board, e.g. `committee_message:<id>`. */
  groupKey: string;
}): Promise<void> {
  const audience = params.recipients.filter((id) => id !== params.actorId);
  if (audience.length === 0) return;

  const [actor, candidates] = await Promise.all([
    db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, params.actorId),
      columns: { name: true, email: true },
    }),
    db
      .select({ userId: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, audience)),
  ]);

  const actorName = actor?.name?.trim() || actor?.email || "Someone";
  const preview = previewOf(params.message);

  const mentioned = new Set(extractMentions(params.message, candidates));
  const rest = audience.filter((id) => !mentioned.has(id));

  await Promise.all([
    mentioned.size > 0
      ? notify({
          type: "mention",
          schoolId: params.schoolId,
          recipients: [...mentioned],
          actorId: params.actorId,
          title: `${actorName} mentioned you`,
          body: `${params.contextName}: ${preview}`,
          url: params.url,
          // No groupKey: a mention is addressed to one person about one
          // message, and collapsing two of them into "2 mentions" loses the
          // only thing that made it worth interrupting them for.
        })
      : Promise.resolve(),
    rest.length > 0
      ? notify({
          type: params.type,
          schoolId: params.schoolId,
          recipients: rest,
          actorId: params.actorId,
          title: params.contextName,
          body: `${actorName}: ${preview}`,
          url: params.url,
          groupKey: params.groupKey,
        })
      : Promise.resolve(),
  ]);
}

/**
 * A one-line preview for a lock screen.
 *
 * Collapses whitespace (a pasted agenda would otherwise push the useful words
 * off the notification) and truncates on a word boundary.
 */
export function previewOf(message: string, max = 120): string {
  const flat = message.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
