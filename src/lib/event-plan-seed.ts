import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { eventCatalog, eventPlanTasks } from "@/lib/db/schema";
import { parseStoredList } from "@/lib/utils";

/**
 * What a year's plan inherits from its recurring event, and what it doesn't.
 *
 * The catalog is where knowledge that outlives a school year is kept, so a fresh
 * plan should arrive holding it rather than empty. Three things carry, by three
 * different mechanisms, and the difference is deliberate:
 *
 *  - **Contacts read through.** `getEventContacts` unions the catalog's links
 *    with the plan's own every time it is called, so correcting the bounce house
 *    company's number once fixes every year. Nothing is copied.
 *  - **Tips read through** too, for the same reason, and are rendered on the
 *    plan's overview straight off `event_catalog.tips`.
 *  - **Key tasks are copied.** A task is a working item — it gets assigned, given
 *    a due date, and ticked off — so it has to be a row on *this* plan. Copying
 *    is therefore the only option, and it happens once, at creation.
 *
 * Because they are copied, key tasks added to the recurring event *later* never
 * reach a plan that already exists. That is what `missingCatalogKeyTasks` is
 * for: the plan's task list offers the ones it hasn't got, and the board decides.
 * Silently re-syncing would resurrect a task a lead deliberately deleted.
 */

/** Compare on the shape of the title, so re-import doesn't duplicate a task. */
function taskKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The key tasks on a recurring event that this plan doesn't already have.
 *
 * Matched on title rather than on a copied-from id: the id would have to survive
 * a board member retyping "Book the DJ" as "Book DJ", and the answer people
 * expect ("don't add it twice") is about the words, not about provenance.
 */
export async function missingCatalogKeyTasks(
  eventPlanId: string,
  catalogKeyTasks: string | null | undefined
): Promise<string[]> {
  const wanted = parseStoredList(catalogKeyTasks);
  if (wanted.length === 0) return [];

  const existing = await db
    .select({ title: eventPlanTasks.title })
    .from(eventPlanTasks)
    .where(eq(eventPlanTasks.eventPlanId, eventPlanId));

  const have = new Set(existing.map((t) => taskKey(t.title)));

  // De-duplicated against itself too — a catalog entry listing the same task
  // twice is a typo, not an instruction.
  const seen = new Set<string>();
  return wanted.filter((title) => {
    const key = taskKey(title);
    if (have.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Append tasks to a plan, after the ones already on it.
 *
 * Takes no authorization of its own — every caller has already established the
 * writer's access to the plan, and this is a library, not an action.
 */
export async function appendPlanTasks(
  eventPlanId: string,
  titles: string[],
  createdBy: string
): Promise<number> {
  if (titles.length === 0) return 0;

  const [{ maxOrder }] = await db
    .select({
      maxOrder: sql<number>`COALESCE(MAX(${eventPlanTasks.sortOrder}), -1)`,
    })
    .from(eventPlanTasks)
    .where(eq(eventPlanTasks.eventPlanId, eventPlanId));
  const startOrder = (maxOrder ?? -1) + 1;

  await db.insert(eventPlanTasks).values(
    titles.map((title, index) => ({
      eventPlanId,
      title,
      sortOrder: startOrder + index,
      createdBy,
    }))
  );

  return titles.length;
}

/**
 * Seed a newly created plan with its recurring event's key tasks.
 *
 * Idempotent through `missingCatalogKeyTasks`, so a caller that runs it twice
 * (a retried generate, a plan created and then re-linked) adds nothing the
 * second time.
 */
export async function seedPlanTasksFromCatalog(params: {
  eventPlanId: string;
  keyTasks: string | null | undefined;
  createdBy: string;
}): Promise<number> {
  const titles = await missingCatalogKeyTasks(
    params.eventPlanId,
    params.keyTasks
  );
  return appendPlanTasks(params.eventPlanId, titles, params.createdBy);
}

/** The catalog columns a plan reads through, fetched once. */
export async function getCatalogPlanDefaults(
  catalogId: string,
  schoolId: string
) {
  return db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.id, catalogId),
      eq(eventCatalog.schoolId, schoolId)
    ),
    columns: { id: true, title: true, keyTasks: true, tips: true },
  });
}
