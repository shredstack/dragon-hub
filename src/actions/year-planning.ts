"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertPtaBoardMember,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventCatalog,
  eventPlans,
  eventPlanMembers,
  eventInterest,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, eq, inArray, asc, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { normalizeTags } from "@/lib/tags";
import { ensureTagsExist } from "@/lib/tag-usage";
import { seedPlanTasksFromCatalog } from "@/lib/event-plan-seed";
import type { PtaBoardPosition } from "@/types";

/**
 * Opening a school year's slate of events, and deciding who runs each one.
 *
 * Both jobs happen in one sitting in August, before anyone is thinking about
 * any single event, and neither fits the existing per-event flows: cloning last
 * year's plan works one event at a time, and a school with two dozen recurring
 * events will not do it two dozen times. The catalog already knows what each
 * event is; this turns that into the year's plans in one pass, then lets the
 * board divide them up.
 */

/** Title a generated plan gets: "Fall Festival (2026-2027)". */
function planTitleFor(catalogTitle: string, schoolYear: string) {
  return `${catalogTitle} (${schoolYear})`;
}

/**
 * Board-level tools answer to the board, not to per-plan membership: the point
 * is to act across every plan at once, including ones nobody has been assigned
 * to yet.
 */
async function assertBoardTool() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  return { userId: user.id!, schoolId };
}

// ─── Step 1: Generate the year's plans ─────────────────────────────────────

export interface YearPlanCandidate {
  catalogId: string;
  title: string;
  planTitle: string;
  category: string | null;
  typicalMonth: number | null;
  timingNote: string | null;
  /** Set when this recurring event already has a plan for the year. */
  existingPlanId: string | null;
  existingPlanTitle: string | null;
  /**
   * Defaults the catalog can't supply, so the board can fill the gaps before
   * generating rather than opening twenty half-empty plans afterwards.
   */
  missingDefaults: string[];
}

/**
 * What generating this year's plans would do, without doing it.
 *
 * Shown before the board commits because the answer is rarely "all of them" —
 * some events already have a plan, and some catalog entries are too thin to
 * produce anything worth opening.
 */
export async function previewYearPlans(
  schoolYear?: string
): Promise<{ schoolYear: string; candidates: YearPlanCandidate[] }> {
  const { schoolId } = await assertBoardTool();
  const year = schoolYear ?? (await getSchoolCurrentYear(schoolId));

  const [entries, existing] = await Promise.all([
    db.query.eventCatalog.findMany({
      where: and(
        eq(eventCatalog.schoolId, schoolId),
        eq(eventCatalog.isActive, true)
      ),
      orderBy: [asc(eventCatalog.typicalMonth), asc(eventCatalog.title)],
    }),
    db.query.eventPlans.findMany({
      where: and(
        eq(eventPlans.schoolId, schoolId),
        eq(eventPlans.schoolYear, year),
        isNotNull(eventPlans.eventCatalogId)
      ),
      columns: { id: true, title: true, eventCatalogId: true },
    }),
  ]);

  const byCatalog = new Map(existing.map((p) => [p.eventCatalogId!, p]));

  const candidates = entries.map((entry) => {
    const missingDefaults: string[] = [];
    if (!entry.defaultEventType) missingDefaults.push("Event type");
    if (!entry.defaultLocation) missingDefaults.push("Location");
    if (!entry.estimatedBudget) missingDefaults.push("Budget");
    if (!entry.tags?.length) missingDefaults.push("Tags");

    const match = byCatalog.get(entry.id);

    return {
      catalogId: entry.id,
      title: entry.title,
      planTitle: planTitleFor(entry.title, year),
      category: entry.category,
      typicalMonth: entry.typicalMonth,
      timingNote: entry.timingNote,
      existingPlanId: match?.id ?? null,
      existingPlanTitle: match?.title ?? null,
      missingDefaults,
    };
  });

  return { schoolYear: year, candidates };
}

/**
 * Open a draft plan for each selected recurring event, prefilled from its
 * catalog entry.
 *
 * Deliberately leaves each plan without a lead. The board member running the
 * generator is not the lead of all twenty-four events, and a membership row
 * saying otherwise would put every one of them on their dashboard and count
 * against their three-or-four for the year. Leads are assigned in step two;
 * until then the board reaches these plans through its own access.
 *
 * Event dates are left empty too — a plan dated "the 1st of October" because
 * that's the catalog's typical month is a date nobody chose, and it would show
 * up on the school calendar as though somebody had.
 *
 * Key tasks *are* copied, because a task is a working item that gets assigned
 * and ticked off and therefore has to be a row on this plan. See
 * `src/lib/event-plan-seed.ts` for why contacts and tips are not.
 */
export async function generateYearPlans(input: {
  schoolYear: string;
  catalogIds: string[];
}) {
  const { userId, schoolId } = await assertBoardTool();

  if (input.catalogIds.length === 0) {
    return { created: 0, skipped: 0, planIds: [] as string[] };
  }

  const entries = await db.query.eventCatalog.findMany({
    where: and(
      eq(eventCatalog.schoolId, schoolId),
      eq(eventCatalog.isActive, true),
      inArray(eventCatalog.id, input.catalogIds)
    ),
  });
  if (entries.length === 0) {
    throw new Error("None of those recurring events exist at this school");
  }

  // Re-check inside the action rather than trusting the preview: the board
  // reviews this list for a while before pressing the button, and a second
  // plan for an event that already has one would split its tasks and contacts
  // across two pages that neither links to the other.
  const existing = await db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.schoolYear, input.schoolYear),
      inArray(eventPlans.eventCatalogId, entries.map((e) => e.id))
    ),
    columns: { eventCatalogId: true },
  });
  const alreadyPlanned = new Set(existing.map((p) => p.eventCatalogId));

  const toCreate = entries.filter((e) => !alreadyPlanned.has(e.id));
  if (toCreate.length === 0) {
    return { created: 0, skipped: entries.length, planIds: [] as string[] };
  }

  const created = await db
    .insert(eventPlans)
    .values(
      toCreate.map((entry) => {
        const tags = normalizeTags(entry.tags);
        return {
          schoolId,
          title: planTitleFor(entry.title, input.schoolYear),
          description: entry.description,
          eventType: entry.defaultEventType,
          eventCatalogId: entry.id,
          isOneOff: false,
          location: entry.defaultLocation,
          budget: entry.estimatedBudget,
          tags: tags.length > 0 ? tags : null,
          schoolYear: input.schoolYear,
          createdBy: userId,
        };
      })
    )
    .returning({ id: eventPlans.id, eventCatalogId: eventPlans.eventCatalogId });

  // Each plan is paired back to its entry by `event_catalog_id` rather than by
  // position, so nothing here depends on the order the rows come back in.
  // Sequential rather than concurrent: twenty-four plans is a once-a-year
  // click, and `appendPlanTasks` reads MAX(sort_order) per plan.
  const keyTasksByCatalog = new Map(toCreate.map((e) => [e.id, e.keyTasks]));
  for (const plan of created) {
    if (!plan.eventCatalogId) continue;
    await seedPlanTasksFromCatalog({
      eventPlanId: plan.id,
      keyTasks: keyTasksByCatalog.get(plan.eventCatalogId),
      createdBy: userId,
    });
  }

  const allTags = normalizeTags(toCreate.flatMap((e) => e.tags ?? []));
  if (allTags.length > 0) await ensureTagsExist(allTags);

  revalidatePath("/events/plans");
  revalidatePath("/events");
  revalidatePath("/admin/board/event-plan-setup");
  revalidatePath("/admin/board/event-catalog");

  return {
    created: created.length,
    skipped: entries.length - toCreate.length,
    planIds: created.map((p) => p.id),
  };
}

/**
 * Open this year's plan for one recurring event, from wherever the board
 * happens to be standing.
 *
 * "Plan the Year" is the August sitting — two dozen events in one pass. But an
 * event added in February is added one at a time, and sending someone to a
 * different screen to say "yes, and plan it this year" is a step nobody
 * associates with what they were just doing. Same generator, same prefill, same
 * seeded tasks; this only narrows it to one and hands back where to go next.
 *
 * Idempotent: an entry that already has a plan for the year returns that plan's
 * id with `created: false` rather than opening a second one.
 */
export async function openPlanForCatalogEntry(
  catalogId: string,
  schoolYear?: string
): Promise<{ planId: string; created: boolean; schoolYear: string }> {
  const { schoolId } = await assertBoardTool();
  const year = schoolYear ?? (await getSchoolCurrentYear(schoolId));

  const existing = await db.query.eventPlans.findFirst({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.schoolYear, year),
      eq(eventPlans.eventCatalogId, catalogId)
    ),
    columns: { id: true },
  });
  if (existing) {
    return { planId: existing.id, created: false, schoolYear: year };
  }

  // Ask why before handing the generator something it will refuse. It filters
  // retired entries out with the same `findMany` that filters out another
  // school's, so its one error covers both cases and names neither — and
  // "restore it first" is the only one of the two a board member can act on.
  const entry = await db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.id, catalogId),
      eq(eventCatalog.schoolId, schoolId)
    ),
    columns: { isActive: true },
  });
  if (!entry) {
    throw new Error("That recurring event doesn't exist at this school");
  }
  if (!entry.isActive) {
    throw new Error(
      "Couldn't open a plan for that event. Retired events drop out of planning; restore it first."
    );
  }

  const result = await generateYearPlans({
    schoolYear: year,
    catalogIds: [catalogId],
  });
  const planId = result.planIds[0];
  if (!planId) {
    // The entry is live and unplanned as of a moment ago, so the only way the
    // generator creates nothing is that somebody else opened the plan in
    // between. That plan is the answer to the question that was asked.
    const raced = await db.query.eventPlans.findFirst({
      where: and(
        eq(eventPlans.schoolId, schoolId),
        eq(eventPlans.schoolYear, year),
        eq(eventPlans.eventCatalogId, catalogId)
      ),
      columns: { id: true },
    });
    if (!raced) {
      throw new Error("Couldn't open a plan for that event");
    }
    return { planId: raced.id, created: false, schoolYear: year };
  }

  return { planId, created: true, schoolYear: year };
}

/**
 * Which recurring events already have a plan for the year — so the catalog can
 * show "planned" beside each entry instead of making the board hold it in mind.
 */
export async function getPlannedCatalogIds(
  schoolYear?: string
): Promise<Record<string, { planId: string; title: string }>> {
  const { schoolId } = await assertBoardTool();
  const year = schoolYear ?? (await getSchoolCurrentYear(schoolId));

  const rows = await db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.schoolYear, year),
      isNotNull(eventPlans.eventCatalogId)
    ),
    columns: { id: true, title: true, eventCatalogId: true },
  });

  return Object.fromEntries(
    rows.map((r) => [r.eventCatalogId!, { planId: r.id, title: r.title }])
  );
}

// ─── Step 2: Assign leads ──────────────────────────────────────────────────

export interface AssignedLead {
  memberId: string;
  userId: string | null;
  name: string;
  email: string;
}

export interface PlanAssignment {
  planId: string;
  title: string;
  catalogId: string | null;
  typicalMonth: number | null;
  status: string;
  boardLead: AssignedLead | null;
  committeeChairs: AssignedLead[];
  /**
   * Leads recorded before board and chair were told apart, and so belonging to
   * neither list. Shown rather than dropped: a plan with one of these has an
   * owner, and reporting it as unassigned would send the board looking for a
   * volunteer it already has.
   */
  unclassifiedLeads: AssignedLead[];
  /**
   * People who said they'd like to lead this event this year.
   *
   * Since Our Events opened the catalog to the whole school this is parents as
   * well as board members, which is a straight improvement to what this screen
   * is for — but a parent volunteering to lead is a conversation, not an
   * assignment, so it stays a suggestion here exactly as it always was.
   */
  volunteeredToLead: { userId: string; name: string }[];
  /** And the softer signal: "6 parents offered to help with this." */
  volunteeredToHelp: { userId: string; name: string }[];
}

export interface BoardMemberLoad {
  userId: string;
  name: string;
  email: string;
  boardPosition: PtaBoardPosition | null;
  /** Plans this person is the *board* lead of. Committee chairs don't count. */
  eventCount: number;
}

/**
 * The whole year on one screen: every plan, who leads it, and how the load is
 * spread across the board.
 *
 * The per-person count is the reason this is a single query rather than a
 * per-plan picker — "three or four events each" is a fact about the board as a
 * whole, and it's invisible if you assign one event at a time.
 */
export async function getYearAssignments(schoolYear?: string): Promise<{
  schoolYear: string;
  plans: PlanAssignment[];
  board: BoardMemberLoad[];
}> {
  const { schoolId } = await assertBoardTool();
  const year = schoolYear ?? (await getSchoolCurrentYear(schoolId));

  const plans = await db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.schoolYear, year)
    ),
    columns: {
      id: true,
      title: true,
      eventCatalogId: true,
      status: true,
    },
    with: { catalogEntry: { columns: { typicalMonth: true } } },
    orderBy: [asc(eventPlans.title)],
  });

  const planIds = plans.map((p) => p.id);

  const [leadRows, boardRows, interestRows] = await Promise.all([
    planIds.length
      ? db
          .select({
            memberId: eventPlanMembers.id,
            eventPlanId: eventPlanMembers.eventPlanId,
            userId: eventPlanMembers.userId,
            leadType: eventPlanMembers.leadType,
            placeholderName: eventPlanMembers.placeholderName,
            placeholderEmail: eventPlanMembers.placeholderEmail,
            userName: users.name,
            userEmail: users.email,
          })
          .from(eventPlanMembers)
          // Left join: a committee chair with no account yet is exactly the
          // case this screen exists to record.
          .leftJoin(users, eq(eventPlanMembers.userId, users.id))
          .where(
            and(
              inArray(eventPlanMembers.eventPlanId, planIds),
              eq(eventPlanMembers.role, "lead")
            )
          )
      : Promise.resolve([]),
    db
      .select({
        userId: schoolMemberships.userId,
        boardPosition: schoolMemberships.boardPosition,
        name: users.name,
        email: users.email,
      })
      .from(schoolMemberships)
      .innerJoin(users, eq(schoolMemberships.userId, users.id))
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.schoolYear, year),
          eq(schoolMemberships.status, "approved"),
          eq(schoolMemberships.role, "pta_board")
        )
      ),
    db
      .select({
        userId: eventInterest.userId,
        eventCatalogId: eventInterest.eventCatalogId,
        interestLevel: eventInterest.interestLevel,
        name: users.name,
      })
      .from(eventInterest)
      .innerJoin(users, eq(eventInterest.userId, users.id))
      .where(
        and(
          eq(eventInterest.schoolId, schoolId),
          eq(eventInterest.schoolYear, year),
          // Both levels now, split below. `observe` is the board's own
          // onboarding answer and means nothing on this screen.
          inArray(eventInterest.interestLevel, ["lead", "help"])
        )
      ),
  ]);

  const describe = (r: (typeof leadRows)[number]): AssignedLead => ({
    memberId: r.memberId,
    userId: r.userId,
    name: r.userName || r.placeholderName || r.userEmail || "Unnamed",
    email: r.userEmail ?? r.placeholderEmail ?? "",
  });

  const leadInterestByCatalog = new Map<
    string,
    { userId: string; name: string }[]
  >();
  const helpInterestByCatalog = new Map<
    string,
    { userId: string; name: string }[]
  >();
  for (const row of interestRows) {
    const target =
      row.interestLevel === "lead"
        ? leadInterestByCatalog
        : helpInterestByCatalog;
    const list = target.get(row.eventCatalogId) ?? [];
    list.push({ userId: row.userId, name: row.name ?? "Unnamed" });
    target.set(row.eventCatalogId, list);
  }

  const assignments: PlanAssignment[] = plans.map((plan) => {
    const leads = leadRows.filter((r) => r.eventPlanId === plan.id);
    return {
      planId: plan.id,
      title: plan.title,
      catalogId: plan.eventCatalogId,
      typicalMonth: plan.catalogEntry?.typicalMonth ?? null,
      status: plan.status,
      boardLead: leads.filter((r) => r.leadType === "board").map(describe)[0] ?? null,
      committeeChairs: leads
        .filter((r) => r.leadType === "committee_chair")
        .map(describe),
      unclassifiedLeads: leads.filter((r) => !r.leadType).map(describe),
      volunteeredToLead: plan.eventCatalogId
        ? (leadInterestByCatalog.get(plan.eventCatalogId) ?? [])
        : [],
      volunteeredToHelp: plan.eventCatalogId
        ? (helpInterestByCatalog.get(plan.eventCatalogId) ?? [])
        : [],
    };
  });

  const board: BoardMemberLoad[] = boardRows
    .map((m) => ({
      userId: m.userId,
      name: m.name ?? m.email ?? "Unnamed",
      email: m.email ?? "",
      boardPosition: m.boardPosition as PtaBoardPosition | null,
      eventCount: assignments.filter((a) => a.boardLead?.userId === m.userId)
        .length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { schoolYear: year, plans: assignments, board };
}

/** Confirm a plan belongs to the caller's school before assigning anyone to it. */
async function assertPlanInSchool(planId: string, schoolId: string) {
  const plan = await db.query.eventPlans.findFirst({
    where: and(eq(eventPlans.id, planId), eq(eventPlans.schoolId, schoolId)),
    columns: { id: true },
  });
  if (!plan) throw new Error("Event plan not found");
}

/**
 * Make `userId` the board lead of a plan, replacing whoever held it.
 *
 * One board lead per plan is the point: it's the answer to "who on the board do
 * I ask about the Fall Festival?", and a list of three is not an answer.
 * Committee chairs are added separately and may be several.
 */
export async function setBoardLead(planId: string, userId: string | null) {
  const { schoolId } = await assertBoardTool();
  await assertPlanInSchool(planId, schoolId);
  const year = await getSchoolCurrentYear(schoolId);

  // Clear the incumbent first, whether or not a replacement is named — this is
  // also how "unassign" is expressed.
  await db
    .delete(eventPlanMembers)
    .where(
      and(
        eq(eventPlanMembers.eventPlanId, planId),
        eq(eventPlanMembers.leadType, "board")
      )
    );

  if (userId) {
    const onBoard = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, year),
        eq(schoolMemberships.status, "approved"),
        eq(schoolMemberships.role, "pta_board")
      ),
      columns: { id: true },
    });
    if (!onBoard) {
      throw new Error(
        "Only PTA board members can be a board lead. Add them as a committee chair instead."
      );
    }

    // They may already be on the plan as a plain member or a chair; the
    // unique index means this has to be an upsert rather than an insert.
    await db
      .insert(eventPlanMembers)
      .values({ eventPlanId: planId, userId, role: "lead", leadType: "board" })
      .onConflictDoUpdate({
        target: [eventPlanMembers.eventPlanId, eventPlanMembers.userId],
        set: { role: "lead", leadType: "board" },
      });
  }

  revalidatePath("/admin/board/event-plan-setup");
  revalidatePath(`/events/plans/${planId}`);
  revalidatePath("/events/plans");
  revalidatePath("/events");
}

/**
 * Add a committee chair — the parent who actually runs the event and is
 * deliberately not on the board.
 *
 * Accepts either an existing account or just a name, because chairs are settled
 * in August and half of them have never signed in. A name-only chair is a
 * roster fact with no account behind it: they appear on the plan and on this
 * screen, and they gain access when they're invited by email and accept.
 */
export async function addCommitteeChair(
  planId: string,
  chair: { userId: string } | { name: string; email?: string }
) {
  const { schoolId } = await assertBoardTool();
  await assertPlanInSchool(planId, schoolId);

  if ("userId" in chair) {
    const year = await getSchoolCurrentYear(schoolId);
    const member = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, chair.userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, year),
        eq(schoolMemberships.status, "approved")
      ),
      columns: { id: true },
    });
    if (!member) {
      throw new Error(
        "That person isn't a member of this school yet — add them by name instead, or invite them by email from the event plan."
      );
    }

    await db
      .insert(eventPlanMembers)
      .values({
        eventPlanId: planId,
        userId: chair.userId,
        role: "lead",
        leadType: "committee_chair",
      })
      .onConflictDoUpdate({
        target: [eventPlanMembers.eventPlanId, eventPlanMembers.userId],
        set: { role: "lead", leadType: "committee_chair" },
      });
  } else {
    const name = chair.name.trim();
    if (!name) throw new Error("Give the committee chair a name");

    await db.insert(eventPlanMembers).values({
      eventPlanId: planId,
      userId: null,
      placeholderName: name,
      placeholderEmail: chair.email?.trim() || null,
      role: "lead",
      leadType: "committee_chair",
    });
  }

  revalidatePath("/admin/board/event-plan-setup");
  revalidatePath(`/events/plans/${planId}`);
  // Chairs are named on Our Events alongside the board lead.
  revalidatePath("/events");
}

/** Drop a committee chair from a plan, by membership row id. */
export async function removeCommitteeChair(memberId: string) {
  const { schoolId } = await assertBoardTool();

  const row = await db.query.eventPlanMembers.findFirst({
    where: eq(eventPlanMembers.id, memberId),
    columns: { id: true, eventPlanId: true, leadType: true },
  });
  if (!row || row.leadType !== "committee_chair") {
    throw new Error("That committee chair isn't on this plan");
  }
  await assertPlanInSchool(row.eventPlanId, schoolId);

  await db.delete(eventPlanMembers).where(eq(eventPlanMembers.id, memberId));

  revalidatePath("/admin/board/event-plan-setup");
  revalidatePath(`/events/plans/${row.eventPlanId}`);
  revalidatePath("/events");
}

/** School members who could be named a committee chair, for the picker. */
export async function getAssignableMembers() {
  const { schoolId } = await assertBoardTool();
  const year = await getSchoolCurrentYear(schoolId);

  const rows = await db
    .select({
      userId: schoolMemberships.userId,
      name: users.name,
      email: users.email,
      role: schoolMemberships.role,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(schoolMemberships.userId, users.id))
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, year),
        eq(schoolMemberships.status, "approved")
      )
    );

  return rows
    .map((r) => ({
      userId: r.userId,
      name: r.name ?? r.email ?? "Unnamed",
      email: r.email ?? "",
      isBoard: r.role === "pta_board",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
