"use server";

import {
  assertAuthenticated,
  assertEventPlanAccess,
  assertPtaBoard,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  schoolContacts,
  eventContactLinks,
  eventCatalog,
  eventPlans,
} from "@/lib/db/schema";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { normalizeTags } from "@/lib/tags";
import { normalizeWebsiteUrl } from "@/lib/utils";
import { ensureTagsExist, syncTagUsage } from "@/lib/tag-usage";
import type { EventContact } from "@/types";

/**
 * Which event a contact link hangs off: the recurring event (evergreen, every
 * future year inherits it) or one school year's plan.
 */
export type ContactTarget =
  | { type: "catalog"; id: string }
  | { type: "plan"; id: string };

interface ContactInput {
  name: string;
  organization?: string;
  category?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  notes?: string;
  tags?: string[];
}

/**
 * Confirm the caller may read/write contacts for this event, and return the
 * school it belongs to.
 *
 * Plans use the same rule as resources — any member of the plan — because the
 * person who needs the bounce house vendor's number is whoever is doing the
 * work, not necessarily a board officer. The catalog is board-only, since a
 * change there propagates to every future year.
 */
async function assertTargetAccess(
  userId: string,
  target: ContactTarget,
  requireLead = false
): Promise<string> {
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  if (target.type === "plan") {
    await assertEventPlanAccess(
      userId,
      target.id,
      requireLead ? ["lead"] : undefined
    );
    const plan = await db.query.eventPlans.findFirst({
      where: eq(eventPlans.id, target.id),
      columns: { schoolId: true },
    });
    if (!plan || plan.schoolId !== schoolId) {
      throw new Error("Event plan not found");
    }
  } else {
    await assertSchoolPtaBoardOrAdmin(userId, schoolId);
    const entry = await db.query.eventCatalog.findFirst({
      where: and(
        eq(eventCatalog.id, target.id),
        eq(eventCatalog.schoolId, schoolId)
      ),
      columns: { id: true },
    });
    if (!entry) throw new Error("Recurring event not found");
  }

  return schoolId;
}

/** Guard a contact belongs to the caller's school before touching it. */
async function assertContactInSchool(contactId: string, schoolId: string) {
  const contact = await db.query.schoolContacts.findFirst({
    where: and(
      eq(schoolContacts.id, contactId),
      eq(schoolContacts.schoolId, schoolId)
    ),
  });
  if (!contact) throw new Error("Contact not found");
  return contact;
}

// ─── Directory ─────────────────────────────────────────────────────────────

/**
 * The school's contact directory, with the events each contact is attached to.
 */
export async function listContacts(includeInactive = false) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  await assertPtaBoard(user.id!);

  const contacts = await db.query.schoolContacts.findMany({
    where: includeInactive
      ? eq(schoolContacts.schoolId, schoolId)
      : and(
          eq(schoolContacts.schoolId, schoolId),
          eq(schoolContacts.isActive, true)
        ),
    orderBy: [asc(schoolContacts.name)],
  });

  if (contacts.length === 0) return [];

  // One pass for every link, then group in memory — a per-contact query here
  // would be a directory-sized N+1.
  const links = await db.query.eventContactLinks.findMany({
    where: inArray(
      eventContactLinks.contactId,
      contacts.map((c) => c.id)
    ),
    with: {
      catalogEntry: { columns: { id: true, title: true } },
      eventPlan: { columns: { id: true, title: true, schoolYear: true } },
    },
  });

  const linksByContact = new Map<
    string,
    { id: string; title: string; usedFor: string | null }[]
  >();
  for (const link of links) {
    const event = link.catalogEntry
      ? { id: link.catalogEntry.id, title: link.catalogEntry.title }
      : link.eventPlan
        ? {
            id: link.eventPlan.id,
            title: `${link.eventPlan.title} (${link.eventPlan.schoolYear})`,
          }
        : null;
    if (!event) continue;

    const list = linksByContact.get(link.contactId) ?? [];
    list.push({ ...event, usedFor: link.usedFor });
    linksByContact.set(link.contactId, list);
  }

  return contacts.map((contact) => ({
    ...contact,
    linkedEvents: linksByContact.get(contact.id) ?? [],
  }));
}

export async function createContact(data: ContactInput) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoard(user.id!);

  const name = data.name.trim();
  if (!name) throw new Error("Give this contact a name");

  const tags = normalizeTags(data.tags);

  const [contact] = await db
    .insert(schoolContacts)
    .values({
      schoolId,
      name,
      organization: data.organization?.trim() || null,
      category: data.category || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      website: normalizeWebsiteUrl(data.website),
      address: data.address?.trim() || null,
      notes: data.notes?.trim() || null,
      tags: tags.length > 0 ? tags : null,
      createdBy: user.id!,
    })
    .returning();

  if (tags.length > 0) await ensureTagsExist(tags);

  revalidatePath("/admin/contacts");
  return contact;
}

export async function updateContact(id: string, data: Partial<ContactInput>) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoard(user.id!);

  const existing = await assertContactInSchool(id, schoolId);
  const tags = data.tags !== undefined ? normalizeTags(data.tags) : undefined;

  await db
    .update(schoolContacts)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.organization !== undefined && {
        organization: data.organization.trim() || null,
      }),
      ...(data.category !== undefined && { category: data.category || null }),
      ...(data.phone !== undefined && { phone: data.phone.trim() || null }),
      ...(data.email !== undefined && { email: data.email.trim() || null }),
      ...(data.website !== undefined && {
        website: normalizeWebsiteUrl(data.website),
      }),
      ...(data.address !== undefined && {
        address: data.address.trim() || null,
      }),
      ...(data.notes !== undefined && { notes: data.notes.trim() || null }),
      ...(tags !== undefined && { tags: tags.length > 0 ? tags : null }),
      updatedAt: new Date(),
    })
    .where(eq(schoolContacts.id, id));

  if (tags !== undefined) await syncTagUsage(existing.tags ?? [], tags);

  revalidatePath("/admin/contacts");
  revalidatePath("/events");
  return { success: true };
}

/**
 * Retire a contact without losing which events used them.
 */
export async function setContactActive(id: string, isActive: boolean) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoard(user.id!);
  await assertContactInSchool(id, schoolId);

  await db
    .update(schoolContacts)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(schoolContacts.id, id));

  revalidatePath("/admin/contacts");
  return { success: true };
}

/**
 * Delete a contact and every event link to it. Board/admin only — a vendor
 * that five events point at shouldn't vanish on one person's click.
 */
export async function deleteContact(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const existing = await assertContactInSchool(id, schoolId);

  await db.delete(schoolContacts).where(eq(schoolContacts.id, id));
  await syncTagUsage(existing.tags ?? [], []);

  revalidatePath("/admin/contacts");
  revalidatePath("/events");
  return { success: true };
}

// ─── Event links ───────────────────────────────────────────────────────────

/**
 * The contacts shown on an event.
 *
 * For a plan this is the union of two sets: contacts attached to the recurring
 * event (inherited — the reason any of this exists) and contacts added to this
 * year only. The `source` field is what lets the UI offer "save this one for
 * future years".
 */
export async function getEventContacts(
  target: ContactTarget
): Promise<EventContact[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];

  if (target.type === "plan") {
    await assertEventPlanAccess(user.id!, target.id);
  } else {
    await assertPtaBoard(user.id!);
  }

  // A plan inherits its recurring event's contacts, so resolve that first.
  let catalogId: string | null = null;
  if (target.type === "plan") {
    const plan = await db.query.eventPlans.findFirst({
      where: eq(eventPlans.id, target.id),
      columns: { eventCatalogId: true },
    });
    catalogId = plan?.eventCatalogId ?? null;
  } else {
    catalogId = target.id;
  }

  const conditions = [];
  if (target.type === "plan") {
    conditions.push(eq(eventContactLinks.eventPlanId, target.id));
  }
  if (catalogId) {
    conditions.push(eq(eventContactLinks.eventCatalogId, catalogId));
  }
  if (conditions.length === 0) return [];

  const links = await db.query.eventContactLinks.findMany({
    where: conditions.length === 1 ? conditions[0] : or(...conditions),
    with: { contact: true },
    orderBy: [asc(eventContactLinks.sortOrder)],
  });

  return links
    .filter((link) => link.contact?.schoolId === schoolId)
    .map((link) => ({
      ...link.contact,
      linkId: link.id,
      usedFor: link.usedFor,
      source: link.eventCatalogId ? ("catalog" as const) : ("plan" as const),
    }))
    .sort((a, b) => {
      // Evergreen contacts first — they're the institutional knowledge.
      if (a.source !== b.source) return a.source === "catalog" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Attach an existing directory contact to an event.
 */
export async function linkContact(data: {
  contactId: string;
  target: ContactTarget;
  usedFor?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await assertTargetAccess(user.id!, data.target);
  await assertContactInSchool(data.contactId, schoolId);

  // Same contact twice on one event is always a mistake, and the partial
  // unique indexes would reject it anyway — check first for a clean message.
  const existing = await db.query.eventContactLinks.findFirst({
    where: and(
      eq(eventContactLinks.contactId, data.contactId),
      data.target.type === "plan"
        ? eq(eventContactLinks.eventPlanId, data.target.id)
        : eq(eventContactLinks.eventCatalogId, data.target.id)
    ),
  });
  if (existing) throw new Error("That contact is already on this event");

  await db.insert(eventContactLinks).values({
    contactId: data.contactId,
    eventCatalogId: data.target.type === "catalog" ? data.target.id : null,
    eventPlanId: data.target.type === "plan" ? data.target.id : null,
    usedFor: data.usedFor?.trim() || null,
    createdBy: user.id!,
  });

  revalidateForTarget(data.target);
  return { success: true };
}

/**
 * Create a brand-new contact and attach it to an event in one step.
 *
 * Access is granted by the event, not by board membership: the person who just
 * got off the phone with the bounce house vendor is whoever is running the
 * event, and making them file a directory entry first (or find a board member
 * to do it) is how the number ends up in a text message instead of DragonHub.
 * That's why this inserts directly rather than calling createContact, which
 * guards the directory itself.
 */
export async function createAndLinkContact(data: {
  target: ContactTarget;
  usedFor?: string;
  contact: ContactInput;
}) {
  const user = await assertAuthenticated();
  const schoolId = await assertTargetAccess(user.id!, data.target);

  const name = data.contact.name.trim();
  if (!name) throw new Error("Give this contact a name");

  const tags = normalizeTags(data.contact.tags);

  const [contact] = await db
    .insert(schoolContacts)
    .values({
      schoolId,
      name,
      organization: data.contact.organization?.trim() || null,
      category: data.contact.category || null,
      phone: data.contact.phone?.trim() || null,
      email: data.contact.email?.trim() || null,
      website: normalizeWebsiteUrl(data.contact.website),
      address: data.contact.address?.trim() || null,
      notes: data.contact.notes?.trim() || null,
      tags: tags.length > 0 ? tags : null,
      createdBy: user.id!,
    })
    .returning();

  if (tags.length > 0) await ensureTagsExist(tags);

  await linkContact({
    contactId: contact.id,
    target: data.target,
    usedFor: data.usedFor,
  });

  revalidatePath("/admin/contacts");
  return contact;
}

export async function updateContactLink(
  linkId: string,
  data: { usedFor?: string }
) {
  const user = await assertAuthenticated();
  const link = await db.query.eventContactLinks.findFirst({
    where: eq(eventContactLinks.id, linkId),
  });
  if (!link) throw new Error("Contact link not found");

  const target = linkTarget(link);
  await assertTargetAccess(user.id!, target);

  await db
    .update(eventContactLinks)
    .set({ usedFor: data.usedFor?.trim() || null })
    .where(eq(eventContactLinks.id, linkId));

  revalidateForTarget(target);
  return { success: true };
}

/**
 * Detach a contact from an event. The contact itself stays in the directory.
 */
export async function unlinkContact(linkId: string) {
  const user = await assertAuthenticated();
  const link = await db.query.eventContactLinks.findFirst({
    where: eq(eventContactLinks.id, linkId),
  });
  if (!link) throw new Error("Contact link not found");

  const target = linkTarget(link);
  await assertTargetAccess(user.id!, target);

  await db.delete(eventContactLinks).where(eq(eventContactLinks.id, linkId));

  revalidateForTarget(target);
  return { success: true };
}

/**
 * Move a plan-specific contact onto the plan's recurring event, so next year's
 * lead inherits it. This is the single most valuable action in the feature —
 * it's how "the vendor we used in 2026" becomes "the vendor we use".
 *
 * Lead-only, matching saveEventPlanWrapUp: adding a contact to this year is
 * everyone's job, but writing to the catalog changes what every future year
 * inherits, and that is the plan lead's call — not an observer's.
 */
export async function promoteContactToCatalog(linkId: string) {
  const user = await assertAuthenticated();

  const link = await db.query.eventContactLinks.findFirst({
    where: eq(eventContactLinks.id, linkId),
  });
  if (!link?.eventPlanId) {
    throw new Error("Only a contact added to this year can be saved forward");
  }

  await assertEventPlanAccess(user.id!, link.eventPlanId, ["lead"]);

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, link.eventPlanId),
    columns: { id: true, eventCatalogId: true },
  });
  if (!plan?.eventCatalogId) {
    throw new Error(
      "Link this event plan to a recurring event first, so there's somewhere to save the contact for future years."
    );
  }

  // Already evergreen via another route — drop the year-specific duplicate.
  const existing = await db.query.eventContactLinks.findFirst({
    where: and(
      eq(eventContactLinks.contactId, link.contactId),
      eq(eventContactLinks.eventCatalogId, plan.eventCatalogId)
    ),
  });

  if (existing) {
    await db.delete(eventContactLinks).where(eq(eventContactLinks.id, linkId));
  } else {
    await db
      .update(eventContactLinks)
      .set({ eventPlanId: null, eventCatalogId: plan.eventCatalogId })
      .where(eq(eventContactLinks.id, linkId));
  }

  revalidatePath(`/events/${plan.id}`);
  revalidatePath("/admin/board/event-catalog");
  return { success: true };
}

/**
 * Directory contacts not already attached to this event, for the picker.
 */
export async function getLinkableContacts(target: ContactTarget) {
  const user = await assertAuthenticated();
  const schoolId = await assertTargetAccess(user.id!, target);

  const [contacts, alreadyLinked] = await Promise.all([
    db.query.schoolContacts.findMany({
      where: and(
        eq(schoolContacts.schoolId, schoolId),
        eq(schoolContacts.isActive, true)
      ),
      columns: {
        id: true,
        name: true,
        organization: true,
        category: true,
        lastUsedYear: true,
      },
      orderBy: [asc(schoolContacts.name)],
    }),
    db.query.eventContactLinks.findMany({
      where:
        target.type === "plan"
          ? eq(eventContactLinks.eventPlanId, target.id)
          : eq(eventContactLinks.eventCatalogId, target.id),
      columns: { contactId: true },
    }),
  ]);

  const linked = new Set(alreadyLinked.map((l) => l.contactId));
  return contacts.filter((c) => !linked.has(c.id));
}

// ─── Internals ─────────────────────────────────────────────────────────────

function linkTarget(link: {
  eventCatalogId: string | null;
  eventPlanId: string | null;
}): ContactTarget {
  if (link.eventCatalogId) return { type: "catalog", id: link.eventCatalogId };
  if (link.eventPlanId) return { type: "plan", id: link.eventPlanId };
  throw new Error("Contact link has no event");
}

function revalidateForTarget(target: ContactTarget) {
  if (target.type === "plan") {
    revalidatePath(`/events/${target.id}`);
  } else {
    revalidatePath("/admin/board/event-catalog");
    revalidatePath("/events");
  }
  revalidatePath("/admin/contacts");
}

/**
 * Contacts with no event attached at all — directory dead weight worth pruning.
 */
export async function getOrphanContacts() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  await assertPtaBoard(user.id!);

  const rows = await db
    .select({ id: schoolContacts.id })
    .from(schoolContacts)
    .leftJoin(
      eventContactLinks,
      eq(eventContactLinks.contactId, schoolContacts.id)
    )
    .where(
      and(
        eq(schoolContacts.schoolId, schoolId),
        isNull(eventContactLinks.id)
      )
    );

  return rows.map((r) => r.id);
}
