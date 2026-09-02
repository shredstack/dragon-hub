"use server";

/**
 * Our Events — the member-facing side of the event catalog.
 *
 * ("Directory" internally, "Our Events" in the UI. Both names are deliberate:
 * the file says what it is, the page says what it's for.)
 *
 * The whole feature is three authorization rules:
 *
 *  1. **`getCatalog()` stays board-only.** It returns `...entry` — every column
 *     on `event_catalog`, tips and budget and vendor-shaped fields included.
 *     The member path is a *separate* function with an explicit `columns:` list
 *     precisely so that adding a column to the table later cannot silently
 *     publish it to the school. See `src/lib/event-directory-shared.ts` for
 *     what that projection is allowed to carry.
 *  2. **Every catalog id from the client is re-checked against the caller's
 *     school.** An id is not proof of anything.
 *  3. **`showReactorNames` is checked here, in the projection**, not in the
 *     component. A setting that hides names in the markup while the payload
 *     still carries them is not a setting, it's a CSS rule.
 */

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  assertAuthenticated,
  assertSchoolMember,
  getCurrentSchoolId,
  isPtaBoardMember,
  isEventPlanLead,
  isSchoolLeadership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventCatalog,
  eventCatalogReactions,
  eventHelpRequests,
  eventInterest,
  eventPlanMembers,
  eventPlans,
  users,
} from "@/lib/db/schema";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { toDateOnly } from "@/lib/date-only";
import { notify } from "@/lib/notify";
import { eventHelpRequestRecipients } from "@/lib/notify-recipients";
import {
  canonicalizeReaction,
  MAX_REACTIONS_PER_PERSON,
  SUGGESTED_EVENT_REACTIONS,
  type ReactionTally,
} from "@/lib/event-reactions-shared";
import { getEventDirectorySettings } from "@/lib/event-directory-settings";
import {
  currentPlanForCatalogEntry,
  eventHelpWaitlistPosition,
  promoteFromEventHelpWaitlist,
  seatOrWaitlistHelpRequest,
} from "@/lib/event-help-onboarding";
import { getPersonBadges } from "@/lib/school-person-badges";
import { getRolledUpEventInterest } from "@/lib/event-interest-rollup";
import { isDeadEnd, type CapacityState } from "@/lib/waitlist-shared";
import { toggleEventInterest } from "@/actions/event-catalog";
import type {
  DirectoryEntry,
  DirectoryPlan,
  DirectoryStats,
  MemberInterestLevel,
  MyHelpRequest,
} from "@/lib/event-directory-shared";
import type { PersonBadge } from "@/lib/school-person-badges-shared";

/**
 * Plan statuses a member is told about. `draft` and `rejected` are absent on
 * purpose — a parent should never learn from this page that the board turned an
 * event down.
 */
const VISIBLE_PLAN_STATUSES = ["approved", "pending_approval", "completed"];

/** The caller, their school, and that they're actually approved in it. */
async function memberContext() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolMember(user.id!, schoolId);
  const schoolYear = await getSchoolCurrentYear(schoolId);
  return { userId: user.id!, schoolId, schoolYear };
}

/**
 * The entry behind an id a client sent, confirmed to be this school's and
 * actually in the front window.
 *
 * Retired (`is_active: false`) and hidden (`show_in_directory: false`) entries
 * are refused rather than merely filtered out of the list: the list is not the
 * only way to reach one of these actions.
 */
async function assertDirectoryEntry(eventCatalogId: string, schoolId: string) {
  const entry = await db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.id, eventCatalogId),
      eq(eventCatalog.schoolId, schoolId)
    ),
    columns: {
      id: true,
      slug: true,
      title: true,
      isActive: true,
      showInDirectory: true,
      helpCap: true,
      helpWaitlistEnabled: true,
    },
  });
  if (!entry || !entry.isActive || !entry.showInDirectory) {
    throw new Error("That event isn't in Our Events");
  }
  return entry;
}

// ─── Reads ─────────────────────────────────────────────────────────────────

/**
 * Every event in the school's front window, with this reader's own state on it.
 *
 * Set-based throughout — one query per *kind* of fact rather than one per
 * event. A twenty-event catalog is one page, and a card that fetched its own
 * counts would be twenty round trips on a parent's cell connection.
 */
export async function getEventDirectory(): Promise<{
  entries: DirectoryEntry[];
  stats: DirectoryStats;
}> {
  const { userId, schoolId, schoolYear } = await memberContext();
  const settings = await getEventDirectorySettings(schoolId);

  const entries = await db.query.eventCatalog.findMany({
    where: and(
      eq(eventCatalog.schoolId, schoolId),
      eq(eventCatalog.isActive, true),
      eq(eventCatalog.showInDirectory, true)
    ),
    // The projection, spelled out. See rule 1 at the top of this file.
    columns: {
      id: true,
      slug: true,
      title: true,
      category: true,
      iconEmoji: true,
      imageUrl: true,
      description: true,
      volunteerResponsibilities: true,
      timeCommitment: true,
      estimatedVolunteers: true,
      typicalMonth: true,
      timingNote: true,
      tags: true,
      helpCap: true,
      helpWaitlistEnabled: true,
    },
    orderBy: [asc(eventCatalog.title)],
  });

  if (entries.length === 0) {
    return { entries: [], stats: { events: 0, reactions: 0, handsUp: 0 } };
  }

  const catalogIds = entries.map((e) => e.id);

  const [plans, tallies, myReactions, myInterests, myRequests, handsUp] =
    await Promise.all([
      // This year's plans for these events, with their leads. One query, then
      // grouped in memory — a per-event lookup here is the N+1 the spec forbids.
      db
        .select({
          planId: eventPlans.id,
          eventCatalogId: eventPlans.eventCatalogId,
          eventDate: eventPlans.eventDate,
          startTime: eventPlans.startTime,
          endTime: eventPlans.endTime,
          status: eventPlans.status,
        })
        .from(eventPlans)
        .where(
          and(
            eq(eventPlans.schoolId, schoolId),
            eq(eventPlans.schoolYear, schoolYear),
            inArray(eventPlans.eventCatalogId, catalogIds)
          )
        ),
      db
        .select({
          eventCatalogId: eventCatalogReactions.eventCatalogId,
          reaction: eventCatalogReactions.reaction,
          total: count(),
        })
        .from(eventCatalogReactions)
        .where(inArray(eventCatalogReactions.eventCatalogId, catalogIds))
        .groupBy(
          eventCatalogReactions.eventCatalogId,
          eventCatalogReactions.reaction
        ),
      db
        .select({
          eventCatalogId: eventCatalogReactions.eventCatalogId,
          reaction: eventCatalogReactions.reaction,
        })
        .from(eventCatalogReactions)
        .where(
          and(
            eq(eventCatalogReactions.userId, userId),
            inArray(eventCatalogReactions.eventCatalogId, catalogIds)
          )
        ),
      db
        .select({
          eventCatalogId: eventInterest.eventCatalogId,
          interestLevel: eventInterest.interestLevel,
          notes: eventInterest.notes,
        })
        .from(eventInterest)
        .where(
          and(
            eq(eventInterest.userId, userId),
            eq(eventInterest.schoolYear, schoolYear),
            inArray(eventInterest.eventCatalogId, catalogIds)
          )
        ),
      db
        .select()
        .from(eventHelpRequests)
        .where(
          and(
            eq(eventHelpRequests.userId, userId),
            eq(eventHelpRequests.schoolYear, schoolYear),
            inArray(eventHelpRequests.eventCatalogId, catalogIds)
          )
        ),
      // The hero's "37 hands up this year" — a count, never names. `observe`
      // is excluded: it's the board's own onboarding answer and nobody would
      // call it a raised hand.
      db
        .select({ total: count() })
        .from(eventInterest)
        .where(
          and(
            eq(eventInterest.schoolId, schoolId),
            eq(eventInterest.schoolYear, schoolYear),
            inArray(eventInterest.eventCatalogId, catalogIds),
            inArray(eventInterest.interestLevel, ["help", "lead"])
          )
        ),
    ]);

  const planIds = plans.map((p) => p.planId);

  const [leadRows, seatRows, myMemberships] = await Promise.all([
    planIds.length > 0
      ? db
          .select({ eventPlanId: eventPlanMembers.eventPlanId, name: users.name })
          .from(eventPlanMembers)
          .leftJoin(users, eq(eventPlanMembers.userId, users.id))
          .where(
            and(
              inArray(eventPlanMembers.eventPlanId, planIds),
              eq(eventPlanMembers.role, "lead")
            )
          )
      : Promise.resolve([] as { eventPlanId: string; name: string | null }[]),
    planIds.length > 0
      ? db
          .select({
            eventPlanId: eventPlanMembers.eventPlanId,
            taken: count(),
          })
          .from(eventPlanMembers)
          .where(inArray(eventPlanMembers.eventPlanId, planIds))
          .groupBy(eventPlanMembers.eventPlanId)
      : Promise.resolve([] as { eventPlanId: string; taken: number }[]),
    planIds.length > 0
      ? db
          .select({ eventPlanId: eventPlanMembers.eventPlanId })
          .from(eventPlanMembers)
          .where(
            and(
              inArray(eventPlanMembers.eventPlanId, planIds),
              eq(eventPlanMembers.userId, userId)
            )
          )
      : Promise.resolve([] as { eventPlanId: string }[]),
  ]);

  const planByCatalog = new Map(
    plans.filter((p) => p.eventCatalogId).map((p) => [p.eventCatalogId!, p])
  );
  const leadsByPlan = new Map<string, string[]>();
  for (const row of leadRows) {
    if (!row.name) continue;
    leadsByPlan.set(row.eventPlanId, [
      ...(leadsByPlan.get(row.eventPlanId) ?? []),
      row.name,
    ]);
  }
  const seatsByPlan = new Map(seatRows.map((r) => [r.eventPlanId, r.taken]));
  const myPlanIds = new Set(myMemberships.map((r) => r.eventPlanId));

  // Board members and school admins can open any plan at this school; everyone
  // else only the ones they're on. Same rule `assertEventPlanAccess` enforces,
  // asked once for the page rather than per card.
  const isLeadership = await isSchoolLeadership(userId, schoolId);

  const mineByCatalog = new Map<string, Set<string>>();
  for (const row of myReactions) {
    const set = mineByCatalog.get(row.eventCatalogId) ?? new Set<string>();
    set.add(row.reaction);
    mineByCatalog.set(row.eventCatalogId, set);
  }

  const talliesByCatalog = new Map<string, ReactionTally[]>();
  let totalReactions = 0;
  for (const row of tallies) {
    totalReactions += Number(row.total);
    const list = talliesByCatalog.get(row.eventCatalogId) ?? [];
    list.push({
      reaction: row.reaction,
      count: Number(row.total),
      mine: mineByCatalog.get(row.eventCatalogId)?.has(row.reaction) ?? false,
    });
    talliesByCatalog.set(row.eventCatalogId, list);
  }

  const interestByCatalog = new Map(
    myInterests.map((i) => [i.eventCatalogId, i])
  );
  const requestByCatalog = new Map(
    myRequests.map((r) => [r.eventCatalogId, r])
  );

  // Positions for the reader's own waitlisted rows. At most a handful, and only
  // for the rows that actually need one.
  const positions = new Map<string, number>();
  for (const row of myRequests) {
    if (row.status !== "waitlisted") continue;
    positions.set(
      row.id,
      await eventHelpWaitlistPosition(db, {
        eventCatalogId: row.eventCatalogId,
        schoolYear: row.schoolYear,
        waitlistedAt: row.waitlistedAt,
      })
    );
  }

  const projected: DirectoryEntry[] = entries.map((entry) => {
    const plan = planByCatalog.get(entry.id) ?? null;
    const request = requestByCatalog.get(entry.id) ?? null;
    const interest = interestByCatalog.get(entry.id);

    return {
      id: entry.id,
      slug: entry.slug,
      title: entry.title,
      category: entry.category,
      iconEmoji: entry.iconEmoji,
      imageUrl: entry.imageUrl,
      description: entry.description,
      volunteerResponsibilities: entry.volunteerResponsibilities,
      timeCommitment: entry.timeCommitment,
      estimatedVolunteers: entry.estimatedVolunteers,
      typicalMonth: entry.typicalMonth,
      timingNote: entry.timingNote,
      tags: entry.tags,
      plan: plan
        ? projectPlan(
            plan,
            leadsByPlan.get(plan.planId) ?? [],
            isLeadership || myPlanIds.has(plan.planId)
          )
        : null,
      capacity: {
        taken: plan ? (seatsByPlan.get(plan.planId) ?? 0) : 0,
        limit: entry.helpCap,
        waitlistEnabled: entry.helpWaitlistEnabled,
      },
      reactions: settings.reactionsEnabled
        ? (talliesByCatalog.get(entry.id) ?? [])
        : [],
      myInterest: memberInterest(interest?.interestLevel),
      myInterestNote: interest?.notes ?? null,
      myRequest: request ? projectRequest(request, positions.get(request.id)) : null,
      onTeam: plan ? myPlanIds.has(plan.planId) : false,
    };
  });

  return {
    entries: projected,
    stats: {
      events: projected.length,
      reactions: settings.reactionsEnabled ? totalReactions : 0,
      handsUp: Number(handsUp[0]?.total ?? 0),
    },
  };
}

function projectPlan(
  plan: {
    planId: string;
    eventDate: Date | null;
    startTime: string | null;
    endTime: string | null;
    status: string;
  },
  leadNames: string[],
  canOpenPlan: boolean
): DirectoryPlan {
  return {
    id: plan.planId,
    // A calendar day, handed over as `YYYY-MM-DD`. `toDateOnly` reads against
    // UTC, so the day survives the trip to a browser in any zone — which
    // `toISOString().slice(0,10)` on a naive value would not.
    eventDate: plan.eventDate ? toDateOnly(plan.eventDate) : null,
    // Wall-clock text, passed through untouched. There is no zone to convert
    // between — see src/lib/time-of-day.ts.
    startTime: plan.startTime,
    endTime: plan.endTime,
    planningStarted: VISIBLE_PLAN_STATUSES.includes(plan.status),
    leadNames: leadNames.sort((a, b) => a.localeCompare(b)),
    canOpenPlan,
  };
}

function projectRequest(
  row: typeof eventHelpRequests.$inferSelect,
  position: number | undefined
): MyHelpRequest {
  return {
    id: row.id,
    status: row.status,
    position: row.status === "waitlisted" ? (position ?? 1) : null,
    decisionNote: row.decisionNote,
  };
}

/** `observe` means nothing to a parent, so the member page never reports it. */
function memberInterest(
  level: string | null | undefined
): MemberInterestLevel | null {
  return level === "help" || level === "lead" ? level : null;
}

/**
 * One event's page: everything the card had, plus who's leading this year and —
 * when the school allows it — who reacted.
 */
export async function getEventDirectoryEntry(
  slug: string
): Promise<DirectoryEntry | null> {
  const { userId, schoolId, schoolYear } = await memberContext();
  const settings = await getEventDirectorySettings(schoolId);

  const entry = await db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.schoolId, schoolId),
      eq(eventCatalog.slug, slug),
      eq(eventCatalog.isActive, true),
      eq(eventCatalog.showInDirectory, true)
    ),
    columns: {
      id: true,
      slug: true,
      title: true,
      category: true,
      iconEmoji: true,
      imageUrl: true,
      description: true,
      volunteerResponsibilities: true,
      timeCommitment: true,
      estimatedVolunteers: true,
      typicalMonth: true,
      timingNote: true,
      tags: true,
      helpCap: true,
      helpWaitlistEnabled: true,
    },
  });
  if (!entry) return null;

  const plan = await currentPlanForCatalogEntry(entry.id, schoolYear);

  const [tallies, myReactions, interest, request, leadRows, seats, seat] =
    await Promise.all([
      db
        .select({
          reaction: eventCatalogReactions.reaction,
          total: count(),
        })
        .from(eventCatalogReactions)
        .where(eq(eventCatalogReactions.eventCatalogId, entry.id))
        .groupBy(eventCatalogReactions.reaction),
      db
        .select({ reaction: eventCatalogReactions.reaction })
        .from(eventCatalogReactions)
        .where(
          and(
            eq(eventCatalogReactions.eventCatalogId, entry.id),
            eq(eventCatalogReactions.userId, userId)
          )
        ),
      db.query.eventInterest.findFirst({
        where: and(
          eq(eventInterest.userId, userId),
          eq(eventInterest.eventCatalogId, entry.id),
          eq(eventInterest.schoolYear, schoolYear)
        ),
      }),
      db.query.eventHelpRequests.findFirst({
        where: and(
          eq(eventHelpRequests.userId, userId),
          eq(eventHelpRequests.eventCatalogId, entry.id),
          eq(eventHelpRequests.schoolYear, schoolYear)
        ),
      }),
      plan
        ? db
            .select({ name: users.name })
            .from(eventPlanMembers)
            .leftJoin(users, eq(eventPlanMembers.userId, users.id))
            .where(
              and(
                eq(eventPlanMembers.eventPlanId, plan.id),
                eq(eventPlanMembers.role, "lead")
              )
            )
        : Promise.resolve([] as { name: string | null }[]),
      plan
        ? db
            .select({ taken: count() })
            .from(eventPlanMembers)
            .where(eq(eventPlanMembers.eventPlanId, plan.id))
        : Promise.resolve([{ taken: 0 }]),
      plan
        ? db.query.eventPlanMembers.findFirst({
            where: and(
              eq(eventPlanMembers.eventPlanId, plan.id),
              eq(eventPlanMembers.userId, userId)
            ),
            columns: { id: true },
          })
        : Promise.resolve(undefined),
    ]);

  const mine = new Set(myReactions.map((r) => r.reaction));
  const reactions: ReactionTally[] = settings.reactionsEnabled
    ? tallies.map((t) => ({
        reaction: t.reaction,
        count: Number(t.total),
        mine: mine.has(t.reaction),
      }))
    : [];

  // Rule 3: names are *absent* from the response when the school hasn't turned
  // them on — not present and hidden.
  let reactorNames: Record<string, string[]> | undefined;
  if (settings.reactionsEnabled && settings.showReactorNames) {
    const rows = await db
      .select({
        reaction: eventCatalogReactions.reaction,
        name: users.name,
      })
      .from(eventCatalogReactions)
      .innerJoin(users, eq(eventCatalogReactions.userId, users.id))
      .where(eq(eventCatalogReactions.eventCatalogId, entry.id))
      .orderBy(asc(users.name));
    reactorNames = {};
    for (const row of rows) {
      if (!row.name) continue;
      reactorNames[row.reaction] = [
        ...(reactorNames[row.reaction] ?? []),
        row.name,
      ];
    }
  }

  const position =
    request?.status === "waitlisted"
      ? await eventHelpWaitlistPosition(db, {
          eventCatalogId: entry.id,
          schoolYear: request.schoolYear,
          waitlistedAt: request.waitlistedAt,
        })
      : undefined;

  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    category: entry.category,
    iconEmoji: entry.iconEmoji,
    imageUrl: entry.imageUrl,
    description: entry.description,
    volunteerResponsibilities: entry.volunteerResponsibilities,
    timeCommitment: entry.timeCommitment,
    estimatedVolunteers: entry.estimatedVolunteers,
    typicalMonth: entry.typicalMonth,
    timingNote: entry.timingNote,
    tags: entry.tags,
    plan: plan
      ? projectPlan(
          {
            planId: plan.id,
            eventDate: plan.eventDate,
            startTime: plan.startTime,
            endTime: plan.endTime,
            status: plan.status,
          },
          leadRows.map((r) => r.name).filter((n): n is string => !!n),
          (await isSchoolLeadership(userId, schoolId)) || !!seat
        )
      : null,
    capacity: {
      taken: Number(seats[0]?.taken ?? 0),
      limit: entry.helpCap,
      waitlistEnabled: entry.helpWaitlistEnabled,
    },
    reactions,
    ...(reactorNames ? { reactorNames } : {}),
    myInterest: memberInterest(interest?.interestLevel),
    myInterestNote: interest?.notes ?? null,
    myRequest: request ? projectRequest(request, position) : null,
    onTeam: !!seat,
  };
}

// ─── Reactions ─────────────────────────────────────────────────────────────

/**
 * Tap an emoji on, or off. One heart per person per event, ever — deliberately
 * not year-scoped, so the page is warm in September instead of resetting to
 * zero every August. `school_year` is stamped anyway, so the board can still
 * ask "who reacted *this* year".
 */
export async function toggleEventReaction(
  eventCatalogId: string,
  emoji: string
) {
  const { userId, schoolId, schoolYear } = await memberContext();
  const settings = await getEventDirectorySettings(schoolId);
  if (!settings.reactionsEnabled) {
    throw new Error("Reactions are turned off for this school");
  }

  const entry = await assertDirectoryEntry(eventCatalogId, schoolId);

  const reaction = canonicalizeReaction(emoji);
  if (!reaction) throw new Error("That isn't an emoji");

  // With custom emoji off, the shortlist still works — the "+" is what goes
  // away, not reactions. Compared post-canonicalization so a pasted "❤" is
  // recognised as the shortlist's "❤️".
  if (!settings.customEmojiEnabled) {
    const allowed = SUGGESTED_EVENT_REACTIONS.map((e) => canonicalizeReaction(e));
    if (!allowed.includes(reaction)) {
      throw new Error("Pick one of the reactions shown");
    }
  }

  const existing = await db.query.eventCatalogReactions.findFirst({
    where: and(
      eq(eventCatalogReactions.userId, userId),
      eq(eventCatalogReactions.eventCatalogId, eventCatalogId),
      eq(eventCatalogReactions.reaction, reaction)
    ),
    columns: { id: true },
  });

  if (existing) {
    await db
      .delete(eventCatalogReactions)
      .where(eq(eventCatalogReactions.id, existing.id));
  } else {
    const [{ mine }] = await db
      .select({ mine: count() })
      .from(eventCatalogReactions)
      .where(
        and(
          eq(eventCatalogReactions.userId, userId),
          eq(eventCatalogReactions.eventCatalogId, eventCatalogId)
        )
      );
    if (mine >= MAX_REACTIONS_PER_PERSON) {
      throw new Error(
        `You can put up to ${MAX_REACTIONS_PER_PERSON} reactions on one event.`
      );
    }

    await db
      .insert(eventCatalogReactions)
      .values({ schoolId, eventCatalogId, userId, reaction, schoolYear })
      // A double-tap on a slow connection is a double-click, not an error.
      .onConflictDoNothing();
  }

  // No notification. Ever. A reaction is one tap with no obligation behind it,
  // and pushing one at somebody is how push gets switched off. Same for a
  // hand-raise below.
  revalidatePath("/events");
  revalidatePath(`/events/${entry.slug}`);
  return { success: true, reaction, on: !existing };
}

// ─── Raising a hand ────────────────────────────────────────────────────────

/**
 * "I'd help" / "I'd like to lead" — a private signal to the board that survives
 * into Plan the Year.
 *
 * Instant and unapproved, because it commits nobody to anything and grants no
 * access. That is the whole difference from `requestToHelpWithEvent` below, and
 * conflating the two is the design mistake this feature exists to avoid: "I'd
 * help at Field Day" must not silently drop someone into a workspace where the
 * treasurer is discussing check numbers.
 *
 * Writes `event_interest`, the same row the board's own onboarding screen
 * writes — a board member who ticks "Lead" on `/onboarding/events` and then
 * opens `/events` sees that state reflected, which is correct. It is one hand,
 * raised once.
 */
export async function setEventInterest(
  eventCatalogId: string,
  level: MemberInterestLevel | null,
  notes?: string
) {
  const { schoolId } = await memberContext();
  const entry = await assertDirectoryEntry(eventCatalogId, schoolId);

  // `observe` is a real answer on the board's onboarding screen ("I want to
  // watch this one before I run it next year") and means nothing to a parent —
  // appreciating an event is what the reaction is for.
  if (level !== null && level !== "help" && level !== "lead") {
    throw new Error("Pick whether you'd help or lead");
  }

  await toggleEventInterest(eventCatalogId, level, notes);

  revalidatePath("/events");
  revalidatePath(`/events/${entry.slug}`);
  return { success: true };
}

// ─── Asking to join the planning team ──────────────────────────────────────

/**
 * "Ask to join planning" — a *request*, because it is the only one of the three
 * verbs that grants **access**: the plan's message board, its tasks, its vendor
 * contacts, its reimbursements. Approval isn't gatekeeping enthusiasm; it is
 * the same door check `event_plan_invites` already makes.
 */
export async function requestToHelpWithEvent(
  eventCatalogId: string,
  message?: string
) {
  const { userId, schoolId, schoolYear } = await memberContext();
  const entry = await assertDirectoryEntry(eventCatalogId, schoolId);

  const plan = await currentPlanForCatalogEntry(entry.id, schoolYear);

  const capacity = await capacityFor(entry, plan?.id ?? null);
  // A parent sees the wall before they hit it — the button already reads "Join
  // the waitlist", or isn't there at all. This is the server half of that.
  if (isDeadEnd(capacity)) {
    throw new Error(
      "This team is full and isn't taking a waitlist. Raise a hand instead and the board will know you're interested."
    );
  }

  const existing = await db.query.eventHelpRequests.findFirst({
    where: and(
      eq(eventHelpRequests.userId, userId),
      eq(eventHelpRequests.eventCatalogId, entry.id),
      eq(eventHelpRequests.schoolYear, schoolYear)
    ),
  });
  if (existing) return { success: true, alreadyAsked: true };

  // Already on the team — a lead added them by hand. Idempotent: stamp the
  // receipt, create nothing. The UI never offers the button in this state.
  const seat = plan
    ? await db.query.eventPlanMembers.findFirst({
        where: and(
          eq(eventPlanMembers.eventPlanId, plan.id),
          eq(eventPlanMembers.userId, userId)
        ),
        columns: { id: true },
      })
    : undefined;

  const [row] = await db
    .insert(eventHelpRequests)
    .values({
      schoolId,
      userId,
      eventCatalogId: entry.id,
      // Filled in now when a plan already exists, so the queue can group by
      // team; still null for the November parent whose plan opens in March.
      eventPlanId: plan?.id ?? null,
      schoolYear,
      message: message?.trim() || null,
      status: seat ? "approved" : "pending",
      ...(seat ? { decidedAt: new Date() } : {}),
    })
    .returning();

  if (!seat) {
    const { board, leads } = await eventHelpRequestRecipients(
      schoolId,
      plan?.id ?? null
    );
    const actor = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { name: true },
    });
    const who = actor?.name ?? "Someone";

    after(async () => {
      // One groupKey for both sends, so five requests for Field Day overnight
      // are one inbox row and one push rather than five.
      const groupKey = `event-help:${entry.id}`;
      const body = `${who} would like to help plan ${entry.title}.`;
      await notify({
        type: "event_help_request",
        schoolId,
        recipients: board,
        actorId: userId,
        title: "Someone wants to help",
        body,
        url: "/admin/board/event-requests",
        groupKey,
      });
      // Leads who aren't on the board can't open the board's queue, so they get
      // the plan they actually run. `eventHelpRequestRecipients` has already
      // taken anyone in both sets out of this one.
      if (leads.length > 0 && plan) {
        await notify({
          type: "event_help_request",
          schoolId,
          recipients: leads,
          actorId: userId,
          title: "Someone wants to help",
          body,
          url: `/events/plans/${plan.id}`,
          groupKey,
        });
      }
    });
  }

  revalidatePath("/events");
  revalidatePath(`/events/${entry.slug}`);
  revalidatePath("/admin/board/event-requests");
  return { success: true, requestId: row.id, seated: !!seat };
}

/**
 * Change your mind while you're still waiting.
 *
 * The row is deleted rather than marked, which is what makes asking again
 * possible — and nobody is notified, because nobody needs to be told someone
 * changed their mind.
 */
export async function withdrawHelpRequest(requestId: string) {
  const { userId, schoolId } = await memberContext();

  const row = await db.query.eventHelpRequests.findFirst({
    where: and(
      eq(eventHelpRequests.id, requestId),
      eq(eventHelpRequests.userId, userId),
      eq(eventHelpRequests.schoolId, schoolId)
    ),
    with: { catalogEntry: { columns: { slug: true } } },
  });
  if (!row) throw new Error("That request no longer exists");
  if (row.status === "approved") {
    throw new Error(
      "You're already on this team — ask a lead to take you off it."
    );
  }

  await db.delete(eventHelpRequests).where(eq(eventHelpRequests.id, requestId));

  // Everyone behind them moves up. Positions are computed from the rows that
  // remain, so this is only a sweep for the case where their withdrawal was
  // the thing standing between a free seat and the person behind them.
  if (row.eventPlanId) {
    await promoteFromEventHelpWaitlist(row.eventPlanId, { promotedBy: userId });
  }

  revalidatePath("/events");
  revalidatePath(`/events/${row.catalogEntry.slug}`);
  revalidatePath("/admin/board/event-requests");
  return { success: true };
}

// ─── The board's side ──────────────────────────────────────────────────────

/** One person in a queue, shaped for `WaitlistTable` / `WaitlistPanel`. */
export interface HelpQueuePerson {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: number;
  notes: string | null;
  badges: PersonBadge[];
  status: "pending" | "waitlisted";
}

export interface HelpQueueGroup {
  eventCatalogId: string;
  title: string;
  slug: string;
  iconEmoji: string | null;
  imageUrl: string | null;
  /** Null when the year has no plan yet — the "Waiting for a plan" group. */
  eventPlanId: string | null;
  capacity: CapacityState;
  pending: HelpQueuePerson[];
  waitlisted: HelpQueuePerson[];
}

/**
 * Every request waiting on a decision this year, grouped by event.
 *
 * Events with no current-year plan are grouped under "Waiting for a plan" by
 * the page: there is no team to seat anyone on, so those requests can't be
 * approved yet and saying so beats a button that throws.
 */
export async function getEventHelpQueue(): Promise<HelpQueueGroup[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  if (!(await isPtaBoardMember(user.id!, schoolId))) {
    throw new Error("Unauthorized: PTA board access required");
  }
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const rows = await db
    .select({
      request: eventHelpRequests,
      userName: users.name,
      userEmail: users.email,
      userPhone: users.phone,
      title: eventCatalog.title,
      slug: eventCatalog.slug,
      iconEmoji: eventCatalog.iconEmoji,
      imageUrl: eventCatalog.imageUrl,
      helpCap: eventCatalog.helpCap,
      helpWaitlistEnabled: eventCatalog.helpWaitlistEnabled,
    })
    .from(eventHelpRequests)
    .innerJoin(users, eq(eventHelpRequests.userId, users.id))
    .innerJoin(eventCatalog, eq(eventHelpRequests.eventCatalogId, eventCatalog.id))
    .where(
      and(
        eq(eventHelpRequests.schoolId, schoolId),
        eq(eventHelpRequests.schoolYear, schoolYear),
        inArray(eventHelpRequests.status, ["pending", "waitlisted"])
      )
    )
    .orderBy(
      asc(eventCatalog.title),
      asc(eventHelpRequests.waitlistedAt),
      asc(eventHelpRequests.createdAt)
    );

  if (rows.length === 0) return [];

  const badges = await getPersonBadges(schoolId, schoolYear);

  const catalogIds = [...new Set(rows.map((r) => r.request.eventCatalogId))];
  const plans = await db
    .select({
      id: eventPlans.id,
      eventCatalogId: eventPlans.eventCatalogId,
      taken: sql<number>`(select count(*) from event_plan_members where event_plan_id = ${eventPlans.id})`,
    })
    .from(eventPlans)
    .where(
      and(
        eq(eventPlans.schoolId, schoolId),
        eq(eventPlans.schoolYear, schoolYear),
        inArray(eventPlans.eventCatalogId, catalogIds)
      )
    );
  const planByCatalog = new Map(
    plans.filter((p) => p.eventCatalogId).map((p) => [p.eventCatalogId!, p])
  );

  const groups = new Map<string, HelpQueueGroup>();
  const waitCounters = new Map<string, number>();
  const pendCounters = new Map<string, number>();

  for (const row of rows) {
    const catalogId = row.request.eventCatalogId;
    let group = groups.get(catalogId);
    if (!group) {
      const plan = planByCatalog.get(catalogId) ?? null;
      group = {
        eventCatalogId: catalogId,
        title: row.title,
        slug: row.slug,
        iconEmoji: row.iconEmoji,
        imageUrl: row.imageUrl,
        eventPlanId: plan?.id ?? null,
        capacity: {
          taken: plan ? Number(plan.taken) : 0,
          limit: row.helpCap,
          waitlistEnabled: row.helpWaitlistEnabled,
        },
        pending: [],
        waitlisted: [],
      };
      groups.set(catalogId, group);
    }

    // The rows arrive in queue order, so position is a running count rather
    // than a query per person.
    const counters =
      row.request.status === "waitlisted" ? waitCounters : pendCounters;
    const position = (counters.get(catalogId) ?? 0) + 1;
    counters.set(catalogId, position);

    const person: HelpQueuePerson = {
      id: row.request.id,
      name: row.userName ?? row.userEmail ?? "Unnamed",
      email: row.userEmail ?? "",
      phone: row.userPhone ?? null,
      position,
      notes: row.request.message,
      badges: badges.get(row.request.userId) ?? [],
      status: row.request.status === "waitlisted" ? "waitlisted" : "pending",
    };

    if (person.status === "waitlisted") group.waitlisted.push(person);
    else group.pending.push(person);
  }

  return [...groups.values()];
}

/**
 * Approve, decline, or (by approving into a full team) waitlist one request.
 *
 * **Board, or a lead of that event's current-year plan.** The lead — often a
 * committee chair who is deliberately not on the board — is the person who
 * knows whether they need another pair of hands. Before a plan exists there is
 * no lead, so those requests are board-only by construction.
 *
 * Returns `{ promoted: number }` so it drops straight into
 * `WaitlistActions.onPromote`: `0` means the seat wasn't there, and the panel
 * follows with the "Add anyway" confirmation.
 */
export async function decideHelpRequest(
  requestId: string,
  decision: "approve" | "decline",
  options?: { note?: string; overCapacity?: boolean }
): Promise<{ promoted: number }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const request = await db.query.eventHelpRequests.findFirst({
    where: and(
      eq(eventHelpRequests.id, requestId),
      eq(eventHelpRequests.schoolId, schoolId)
    ),
    with: { catalogEntry: { columns: { id: true, title: true, slug: true } } },
  });
  if (!request) throw new Error("That request no longer exists");

  const plan = await currentPlanForCatalogEntry(
    request.eventCatalogId,
    schoolYear
  );

  await assertCanDecide(user.id!, schoolId, plan?.id ?? null);

  const note = options?.note?.trim() || null;

  if (decision === "decline") {
    await db
      .update(eventHelpRequests)
      .set({
        status: "declined",
        decidedBy: user.id!,
        decidedAt: new Date(),
        decisionNote: note,
        waitlistedAt: null,
      })
      .where(eq(eventHelpRequests.id, requestId));

    // Quiet and kind: one in-app notification with the note if one was written,
    // and no lingering "declined" badge on their view of the event — the card
    // goes back to offering "raise a hand", which is the honest next step.
    after(() =>
      notify({
        type: "event_help_decision",
        schoolId,
        recipients: [request.userId],
        actorId: user.id!,
        title: `About ${request.catalogEntry.title}`,
        body: note
          ? `The team is set for now. ${note}`
          : "The team for this one is set for now — thank you for offering.",
        url: `/events/${request.catalogEntry.slug}`,
      })
    );

    revalidateHelpSurfaces(request.catalogEntry.slug, plan?.id ?? null);
    return { promoted: 0 };
  }

  if (!plan) {
    throw new Error(
      "There's no plan for this event yet. Open this year's plan on Plan the Year first, then approve."
    );
  }

  const result = await seatOrWaitlistHelpRequest({
    requestId,
    eventPlanId: plan.id,
    decidedBy: user.id!,
    overCapacity: !!options?.overCapacity,
  });

  if (result.promoted > 0) {
    after(() =>
      notify({
        type: "event_help_decision",
        schoolId,
        recipients: [request.userId],
        actorId: user.id!,
        title: `You're on the team for ${request.catalogEntry.title}`,
        body: note ?? "You've been added to this year's planning team.",
        url: `/events/plans/${plan.id}`,
      })
    );
  }

  revalidateHelpSurfaces(request.catalogEntry.slug, plan.id);
  return { promoted: result.promoted };
}

/**
 * The out-of-order promotion the board's table offers — a thin wrapper over the
 * sweep, so a hand-promotion and an automatic one behave identically.
 */
export async function promoteEventHelpRequest(
  requestId: string,
  options?: { overCapacity?: boolean }
): Promise<{ promoted: number }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const request = await db.query.eventHelpRequests.findFirst({
    where: and(
      eq(eventHelpRequests.id, requestId),
      eq(eventHelpRequests.schoolId, schoolId)
    ),
    with: { catalogEntry: { columns: { slug: true } } },
  });
  if (!request) throw new Error("That request no longer exists");

  const plan = await currentPlanForCatalogEntry(
    request.eventCatalogId,
    schoolYear
  );
  await assertCanDecide(user.id!, schoolId, plan?.id ?? null);
  if (!plan) throw new Error("There's no plan for this event yet");

  const result = await promoteFromEventHelpWaitlist(plan.id, {
    requestId,
    promotedBy: user.id!,
    overCapacity: !!options?.overCapacity,
  });

  revalidateHelpSurfaces(request.catalogEntry.slug, plan.id);
  return result;
}

/** Take someone out of the line without seating them. */
export async function removeEventHelpRequest(requestId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const request = await db.query.eventHelpRequests.findFirst({
    where: and(
      eq(eventHelpRequests.id, requestId),
      eq(eventHelpRequests.schoolId, schoolId)
    ),
    with: { catalogEntry: { columns: { slug: true } } },
  });
  if (!request) return { success: true };

  const plan = await currentPlanForCatalogEntry(
    request.eventCatalogId,
    schoolYear
  );
  await assertCanDecide(user.id!, schoolId, plan?.id ?? null);

  await db.delete(eventHelpRequests).where(eq(eventHelpRequests.id, requestId));

  revalidateHelpSurfaces(request.catalogEntry.slug, plan?.id ?? null);
  return { success: true };
}

/**
 * Board, or a lead of this event's current-year plan.
 *
 * School admins are deliberately excluded, and it is the one place they don't
 * inherit their usual virtual membership of every plan: approving is
 * governance, and `assertEventPlanAccess` resolves them as `member` for exactly
 * this reason.
 */
async function assertCanDecide(
  userId: string,
  schoolId: string,
  eventPlanId: string | null
) {
  if (await isPtaBoardMember(userId, schoolId)) return;
  if (eventPlanId && (await isEventPlanLead(userId, eventPlanId))) return;
  throw new Error(
    "Only the PTA board or this event's leads can answer help requests"
  );
}

function revalidateHelpSurfaces(slug: string, eventPlanId: string | null) {
  revalidatePath("/events");
  revalidatePath(`/events/${slug}`);
  revalidatePath("/admin/board/event-requests");
  revalidatePath("/admin/board/event-catalog");
  if (eventPlanId) revalidatePath(`/events/plans/${eventPlanId}`);
}

async function capacityFor(
  entry: { helpCap: number | null; helpWaitlistEnabled: boolean },
  eventPlanId: string | null
): Promise<CapacityState> {
  if (!eventPlanId) {
    return {
      taken: 0,
      limit: entry.helpCap,
      waitlistEnabled: entry.helpWaitlistEnabled,
    };
  }
  const [row] = await db
    .select({ taken: count() })
    .from(eventPlanMembers)
    .where(eq(eventPlanMembers.eventPlanId, eventPlanId));
  return {
    taken: Number(row?.taken ?? 0),
    limit: entry.helpCap,
    waitlistEnabled: entry.helpWaitlistEnabled,
  };
}

// ─── One event's roster, for the board and its leads ───────────────────────

export interface InterestRosterPerson {
  userId: string;
  name: string;
  email: string;
  notes: string | null;
  badges: PersonBadge[];
}

export interface EventInterestRoster {
  leads: InterestRosterPerson[];
  helpers: InterestRosterPerson[];
  observers: InterestRosterPerson[];
  /** Emoji → the people who tapped it. Board-side, so never gated on a setting. */
  reactions: { reaction: string; count: number; names: string[] }[];
  requests: {
    id: string;
    name: string;
    email: string;
    message: string | null;
    status: string;
    badges: PersonBadge[];
  }[];
  /**
   * The other door: parents who scanned a QR campaign flyer for this same
   * event. Read-only, de-duplicated on email — so "did anyone volunteer for
   * Field Day?" is asked once rather than in two places.
   */
  fromCampaigns: {
    name: string;
    email: string;
    phone: string | null;
    notes: string | null;
    /** True when they *also* raised a hand in the app. */
    alsoInApp: boolean;
  }[];
}

/**
 * Who has raised a hand, reacted, or asked to help with one event.
 *
 * The board-side counterpart of the member page, and the successor to
 * `getInterestSummary` — same three interest lists, now with parents in them
 * rather than only board members, plus the reactions and the request queue for
 * that one event.
 *
 * Badges are attached here because this is a board/lead surface. They stay off
 * the member-facing projection under every setting: "Amy loves this" is a warm
 * fact; "Mrs. Chen (Teacher) loves this" is a directory entry, and the teacher
 * didn't ask to be labelled on a page for families.
 */
export async function getEventInterestRoster(
  eventCatalogId: string
): Promise<EventInterestRoster> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Ownership check before anything is read: a catalog id from the client is
  // not proof that the entry is this school's.
  const entry = await db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.id, eventCatalogId),
      eq(eventCatalog.schoolId, schoolId)
    ),
    columns: { id: true },
  });
  if (!entry) throw new Error("Recurring event not found");

  const plan = await currentPlanForCatalogEntry(eventCatalogId, schoolYear);
  await assertCanDecide(user.id!, schoolId, plan?.id ?? null);

  const [interests, reactionRows, requestRows, badges, rollup] = await Promise.all([
    db
      .select({
        userId: eventInterest.userId,
        interestLevel: eventInterest.interestLevel,
        notes: eventInterest.notes,
        name: users.name,
        email: users.email,
      })
      .from(eventInterest)
      .innerJoin(users, eq(eventInterest.userId, users.id))
      .where(
        and(
          eq(eventInterest.eventCatalogId, eventCatalogId),
          eq(eventInterest.schoolYear, schoolYear)
        )
      )
      .orderBy(asc(users.name)),
    db
      .select({
        reaction: eventCatalogReactions.reaction,
        name: users.name,
      })
      .from(eventCatalogReactions)
      .innerJoin(users, eq(eventCatalogReactions.userId, users.id))
      .where(eq(eventCatalogReactions.eventCatalogId, eventCatalogId))
      .orderBy(asc(users.name)),
    db
      .select({
        id: eventHelpRequests.id,
        userId: eventHelpRequests.userId,
        message: eventHelpRequests.message,
        status: eventHelpRequests.status,
        name: users.name,
        email: users.email,
      })
      .from(eventHelpRequests)
      .innerJoin(users, eq(eventHelpRequests.userId, users.id))
      .where(
        and(
          eq(eventHelpRequests.eventCatalogId, eventCatalogId),
          eq(eventHelpRequests.schoolYear, schoolYear)
        )
      )
      .orderBy(asc(eventHelpRequests.createdAt)),
    getPersonBadges(schoolId, schoolYear),
    getRolledUpEventInterest({
      schoolId,
      schoolYear,
      eventCatalogIds: [eventCatalogId],
    }),
  ]);

  const person = (row: {
    userId: string;
    name: string | null;
    email: string | null;
    notes: string | null;
  }): InterestRosterPerson => ({
    userId: row.userId,
    name: row.name ?? row.email ?? "Unnamed",
    email: row.email ?? "",
    notes: row.notes,
    badges: badges.get(row.userId) ?? [],
  });

  const byReaction = new Map<string, string[]>();
  for (const row of reactionRows) {
    byReaction.set(row.reaction, [
      ...(byReaction.get(row.reaction) ?? []),
      row.name ?? "Someone",
    ]);
  }

  return {
    leads: interests.filter((i) => i.interestLevel === "lead").map(person),
    helpers: interests.filter((i) => i.interestLevel === "help").map(person),
    observers: interests.filter((i) => i.interestLevel === "observe").map(person),
    reactions: [...byReaction.entries()]
      .map(([reaction, names]) => ({ reaction, count: names.length, names }))
      .sort((a, b) => b.count - a.count),
    requests: requestRows.map((r) => ({
      id: r.id,
      name: r.name ?? r.email ?? "Unnamed",
      email: r.email ?? "",
      message: r.message,
      status: r.status,
      badges: badges.get(r.userId) ?? [],
    })),
    fromCampaigns: (rollup.get(eventCatalogId) ?? [])
      .filter((person) => person.sources.includes("campaign"))
      .map((person) => ({
        name: person.name,
        email: person.email,
        phone: person.phone,
        notes: person.notes,
        alsoInApp: person.sources.includes("our_events"),
      })),
  };
}

/**
 * The requests waiting on one plan's team, for the roster panel on the plan
 * itself — so the lead approving them is the person who owns the team.
 */
export async function getPlanHelpRequests(eventPlanId: string): Promise<{
  pending: HelpQueuePerson[];
  waitlisted: HelpQueuePerson[];
  capacity: CapacityState;
  canDecide: boolean;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, eventPlanId), eq(eventPlans.schoolId, schoolId)),
    columns: { id: true, eventCatalogId: true, schoolYear: true },
  });

  const empty = {
    pending: [],
    waitlisted: [],
    capacity: { taken: 0, limit: null, waitlistEnabled: true } as CapacityState,
    canDecide: false,
  };
  if (!plan?.eventCatalogId) return empty;

  const canDecide =
    (await isPtaBoardMember(user.id!, schoolId)) ||
    (await isEventPlanLead(user.id!, eventPlanId));
  if (!canDecide) return empty;

  const [entry, rows, seats, badges] = await Promise.all([
    db.query.eventCatalog.findFirst({
      where: eq(eventCatalog.id, plan.eventCatalogId),
      columns: { helpCap: true, helpWaitlistEnabled: true },
    }),
    db
      .select({
        request: eventHelpRequests,
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(eventHelpRequests)
      .innerJoin(users, eq(eventHelpRequests.userId, users.id))
      .where(
        and(
          eq(eventHelpRequests.eventCatalogId, plan.eventCatalogId),
          eq(eventHelpRequests.schoolYear, plan.schoolYear),
          inArray(eventHelpRequests.status, ["pending", "waitlisted"])
        )
      )
      .orderBy(
        asc(eventHelpRequests.waitlistedAt),
        asc(eventHelpRequests.createdAt)
      ),
    db
      .select({ taken: count() })
      .from(eventPlanMembers)
      .where(eq(eventPlanMembers.eventPlanId, eventPlanId)),
    getPersonBadges(schoolId, schoolYear),
  ]);

  const pending: HelpQueuePerson[] = [];
  const waitlisted: HelpQueuePerson[] = [];
  for (const row of rows) {
    const list = row.request.status === "waitlisted" ? waitlisted : pending;
    list.push({
      id: row.request.id,
      name: row.name ?? row.email ?? "Unnamed",
      email: row.email ?? "",
      phone: row.phone ?? null,
      position: list.length + 1,
      notes: row.request.message,
      badges: badges.get(row.request.userId) ?? [],
      status: row.request.status === "waitlisted" ? "waitlisted" : "pending",
    });
  }

  return {
    pending,
    waitlisted,
    capacity: {
      taken: Number(seats[0]?.taken ?? 0),
      limit: entry?.helpCap ?? null,
      waitlistEnabled: entry?.helpWaitlistEnabled ?? true,
    },
    canDecide,
  };
}

/** Approve every pending request on a plan in one go. */
export async function approveAllPlanHelpRequests(eventPlanId: string) {
  const { pending } = await getPlanHelpRequests(eventPlanId);
  let seated = 0;
  for (const person of pending) {
    const result = await decideHelpRequest(person.id, "approve");
    seated += result.promoted;
  }
  return { seated, asked: pending.length };
}

/**
 * How many requests are waiting on a decision this year — the badge on the hub
 * card. Zero rather than a throw for someone who isn't on the board, so a
 * caller can render the hub without a guard of its own.
 */
export async function countPendingHelpRequests(): Promise<number> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return 0;
  if (!(await isPtaBoardMember(user.id!, schoolId))) return 0;
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const [row] = await db
    .select({ total: count() })
    .from(eventHelpRequests)
    .where(
      and(
        eq(eventHelpRequests.schoolId, schoolId),
        eq(eventHelpRequests.schoolYear, schoolYear),
        eq(eventHelpRequests.status, "pending")
      )
    );
  return Number(row?.total ?? 0);
}
