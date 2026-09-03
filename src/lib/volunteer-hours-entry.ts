import "server-only";
import { db } from "@/lib/db";
import {
  classrooms,
  committees,
  eventCatalog,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, asc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getUnclaimedVolunteers } from "@/lib/volunteer-hours-linking";
import {
  COMMITTEE_CATEGORY,
  ROOM_PARENT_CATEGORY,
  roomParentActivityLabel,
  suggestedCategoryForEventCategory,
  type VolunteerActivityOptions,
} from "@/lib/volunteer-activities-shared";

/**
 * The board's side of logging hours: entering what other people did.
 *
 * Everything here is school-wide, which is the one way it differs from
 * `getVolunteerHourActivityOptions` in `actions/volunteer-hours.ts`. That
 * function deliberately offers only the caller's own rooms and committees, so
 * the picker can't be read as a roster of who is on what. Here the caller is
 * transcribing a sheet of other people's hours, so it has to offer every room
 * and every committee the school runs — and the reader is already the board,
 * which can see all of them anyway.
 *
 * Callers are board-gated; nothing here does its own authorization.
 */

export async function getSchoolActivityOptions(
  schoolId: string
): Promise<VolunteerActivityOptions> {
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const [events, rooms, schoolCommittees] = await Promise.all([
    db.query.eventCatalog.findMany({
      where: and(
        eq(eventCatalog.schoolId, schoolId),
        eq(eventCatalog.isActive, true)
      ),
      columns: { id: true, title: true, category: true },
      orderBy: [asc(eventCatalog.title)],
    }),
    db
      .select({ name: classrooms.name })
      .from(classrooms)
      .where(
        and(
          eq(classrooms.schoolId, schoolId),
          eq(classrooms.schoolYear, schoolYear),
          eq(classrooms.active, true)
        )
      )
      .orderBy(asc(classrooms.name)),
    db
      .select({ id: committees.id, name: committees.name })
      .from(committees)
      .where(
        and(
          eq(committees.schoolId, schoolId),
          eq(committees.schoolYear, schoolYear),
          // A draft committee isn't running yet, so nobody logged hours for it.
          ne(committees.status, "draft")
        )
      )
      .orderBy(asc(committees.name)),
  ]);

  return {
    events: events.map((event) => ({
      value: event.title,
      label: event.title,
      suggestedCategory: suggestedCategoryForEventCategory(event.category),
    })),
    classrooms: rooms.map((room) => ({
      value: roomParentActivityLabel(room.name),
      label: roomParentActivityLabel(room.name),
      suggestedCategory: ROOM_PARENT_CATEGORY,
    })),
    committees: schoolCommittees.map((committee) => ({
      id: committee.id,
      value: committee.name,
      label: committee.name,
      suggestedCategory: COMMITTEE_CATEGORY,
    })),
  };
}

/**
 * Someone the hours on the sheet could belong to.
 *
 * `member` is an account; `guest` is a name the board has already recorded
 * hours for and that nobody has claimed yet. Offering both is what stops the
 * same volunteer becoming two rows in the report because the secretary typed
 * their name at two consecutive meetings.
 */
export interface VolunteerCandidate {
  kind: "member" | "guest";
  /** The account, when there is one. */
  userId: string | null;
  name: string;
  email: string | null;
}

const MATCH_LIMIT = 8;

/**
 * People at this school matching a partial name or address.
 *
 * The name the board writes down is what they're searching by, so this matches
 * on name *or* email in both halves. Members are listed before guests: an
 * account is the stronger identity, and picking it is what makes the entry
 * appear on that parent's own page straight away.
 */
export async function searchVolunteerCandidates(
  schoolId: string,
  query: string
): Promise<VolunteerCandidate[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const pattern = `%${term}%`;

  const [members, guests] = await Promise.all([
    db
      .selectDistinctOn([users.id], {
        userId: users.id,
        name: users.name,
        email: users.email,
      })
      .from(schoolMemberships)
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          // Anyone the school has ever admitted, not just this year's roster —
          // hours get entered for a parent whose membership rolled over, and a
          // September sheet is often typed up in October.
          inArray(schoolMemberships.status, ["approved", "pending"]),
          or(ilike(users.name, pattern), ilike(users.email, pattern))
        )
      )
      .limit(MATCH_LIMIT),
    getUnclaimedVolunteers(schoolId),
  ]);

  const lowered = term.toLowerCase();
  const matchedGuests = guests
    .filter(
      (guest) =>
        guest.name?.toLowerCase().includes(lowered) ||
        guest.email?.toLowerCase().includes(lowered)
    )
    // A guest whose address now belongs to an account is already in the list
    // above; the linker will fold their rows in at that person's next sign-in.
    .slice(0, MATCH_LIMIT);

  return [
    ...members.map(
      (member): VolunteerCandidate => ({
        kind: "member",
        userId: member.userId,
        name: member.name ?? member.email,
        email: member.email,
      })
    ),
    ...matchedGuests.map(
      (guest): VolunteerCandidate => ({
        kind: "guest",
        userId: null,
        name: guest.name,
        email: guest.email,
      })
    ),
  ].slice(0, MATCH_LIMIT * 2);
}

/** An account holding this address, if any — the board may have typed one in. */
export async function findUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, name: true, email: true },
  });
}
