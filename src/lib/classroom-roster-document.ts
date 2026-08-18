/**
 * A classroom roster as a *document* rather than a grid.
 *
 * The CSV export answers "give me the data"; this answers "give me the sheet I
 * can hand a teacher, print for the classroom wall, or attach to a room parent
 * email". Same query, same disclosure rules, different shape: the flat rows of
 * `MemberExportResult` are regrouped into the sections a room actually has —
 * its teachers, its room parents, its party volunteers, and one block per
 * classroom committee covering it.
 *
 * The regrouping is done from `MemberExportResult.assignments`, whose `type`
 * and `status` are slugs. Grouping on the display labels in `rows` would mean
 * matching the string `"Room Parent"`, which stops working the day someone
 * rewords it.
 *
 * **Adults only, like every other classroom roster.** Nothing here reaches past
 * what `buildMemberExport` already decided may be printed about a person — a
 * teacher of record admitted by the school's own staff code still has no phone.
 *
 * Client-safe: the PDF renderer and any on-screen preview share one set of
 * rules, and no part of this touches the database.
 */

import {
  ASSIGNMENT_TYPES,
  type MemberExportAssignment,
} from "@/lib/member-export";
import { CLASSROOM_ROSTER_DISCLAIMER } from "@/lib/classroom-roster-export";

export interface RosterPerson {
  name: string;
  email: string;
  phone: string;
  /**
   * The one line under the name — the parties they took, "Chair", "Waitlist
   * #2". Empty for the common case of a plain seated volunteer.
   */
  detail: string;
  waitlisted: boolean;
}

export interface RosterSection {
  /** Stable within a room; used as a render key, never shown. */
  id: string;
  title: string;
  /**
   * Seats filled against the cap — "2 of 2 seats filled". Null when the pool is
   * uncapped, which is the honest answer for party volunteers: there is no
   * denominator, so printing one would invent a target the room doesn't have.
   */
  coverage: string | null;
  /** A section-level summary line, currently the per-party counts. */
  summary: string | null;
  people: RosterPerson[];
  /** Seats in this section nobody holds. Rendered as "1 spot still open". */
  openSeats: number;
  /** What to print when the section has nobody in it at all. */
  emptyMessage: string;
}

export interface RosterRoom {
  classroomId: string;
  classroomName: string;
  gradeLevel: string;
  /** The room's teachers of record. Often one; a half-day room has two. */
  teachers: RosterPerson[];
  sections: RosterSection[];
  /** Distinct people across every section — the count in the room's header. */
  peopleCount: number;
}

export interface RosterDocument {
  title: string;
  schoolName: string;
  schoolYear: string;
  /** Already formatted in the school's own time zone by the caller. */
  exportedOn: string;
  rooms: RosterRoom[];
  disclaimer: string;
  footerNote: string;
}

/**
 * A school-configured party type ("halloween") as a heading.
 *
 * The rest of the app renders these with CSS `capitalize`, which a PDF has no
 * equivalent of — so the same convention, done in the string. These are free
 * text the board typed, so anything already capitalized is left alone.
 */
function formatPartyType(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function personFrom(
  assignment: MemberExportAssignment,
  detail: string
): RosterPerson | null {
  if (!assignment.person) return null;
  return {
    name: assignment.person.name || assignment.person.email,
    email: assignment.person.email,
    phone: assignment.person.phone,
    detail,
    waitlisted: assignment.status === "waitlisted",
  };
}

function seatCoverage(active: number, limit: number | null): string | null {
  if (limit === null) return null;
  return `${active} of ${limit} ${limit === 1 ? "spot" : "spots"} filled`;
}

/**
 * The parties this room's volunteers signed up for, with a head count each.
 *
 * Party volunteers are uncapped, so "3 of ? filled" is meaningless and the
 * useful summary is the other axis: which party has how many hands. Details
 * arrive as the comma-joined `party_types` array written at signup.
 */
function partySummary(assignments: MemberExportAssignment[]): string | null {
  const counts = new Map<string, number>();
  for (const a of assignments) {
    if (a.status !== "active" || !a.person) continue;
    for (const raw of a.details.split(",")) {
      const party = raw.trim();
      if (!party) continue;
      counts.set(party, (counts.get(party) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  return [...counts.entries()]
    .map(([party, count]) => `${formatPartyType(party)}: ${count}`)
    .join("   ");
}

/** The parties one volunteer took, as their detail line. */
function partyDetail(details: string): string {
  const parties = details
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(formatPartyType);
  return parties.length > 0 ? parties.join(", ") : "";
}

/**
 * Build one room's sections from the assignments matching it.
 *
 * `assignments` is everything the export returned for this classroom, in the
 * order `buildMemberExport` sorted it: by type, then status, then seat order.
 * That order is preserved throughout — a room parent promoted off the waitlist
 * stays behind the person who held their spot all along, exactly as the CSV
 * shows them.
 */
export function buildRosterRoom(
  classroomId: string,
  classroomName: string,
  gradeLevel: string,
  assignments: MemberExportAssignment[]
): RosterRoom {
  const mine = assignments.filter((a) => a.classroomId === classroomId);
  const sections: RosterSection[] = [];
  const emails = new Set<string>();

  const teachers: RosterPerson[] = [];
  for (const a of mine) {
    if (a.type !== "teacher") continue;
    const person = personFrom(a, "");
    if (person) teachers.push(person);
  }

  // ─── Room parents ────────────────────────────────────────────────────────

  const roomParents = mine.filter((a) => a.type === "room_parent");
  if (roomParents.length > 0) {
    const people: RosterPerson[] = [];
    let waiting = 0;
    for (const a of roomParents) {
      const person = personFrom(
        a,
        a.status === "waitlisted" ? `Waitlist #${a.order}` : ""
      );
      if (person) {
        people.push(person);
        if (a.status === "waitlisted") waiting += 1;
      }
    }
    const active = people.length - waiting;
    sections.push({
      id: "room_parent",
      title: ASSIGNMENT_TYPES.room_parent + "s",
      coverage: seatCoverage(
        active,
        roomParents.find((a) => a.spots !== null)?.spots ?? null
      ),
      summary: null,
      people,
      openSeats: roomParents.filter((a) => a.status === "unfilled").length,
      emptyMessage: "Nobody has signed up as a room parent yet.",
    });
  }

  // ─── Party volunteers ────────────────────────────────────────────────────

  const partyVolunteers = mine.filter((a) => a.type === "party_volunteer");
  if (partyVolunteers.length > 0) {
    const people: RosterPerson[] = [];
    for (const a of partyVolunteers) {
      const person = personFrom(a, partyDetail(a.details));
      if (person) people.push(person);
    }
    sections.push({
      id: "party_volunteer",
      title: ASSIGNMENT_TYPES.party_volunteer + "s",
      // Uncapped by design — see `partySummary`.
      coverage: null,
      summary: partySummary(partyVolunteers),
      people,
      openSeats: 0,
      emptyMessage: "Nobody has signed up to help with a party yet.",
    });
  }

  // ─── Classroom committees ────────────────────────────────────────────────
  // One section each, not one lumped "Committees" block. At a 20-room school
  // Meet the Masters is twenty separate pairs of parents, and this room's pair
  // is what its roster is about.

  const committeeNames = [
    ...new Set(
      mine
        .filter((a) => a.type === "classroom_committee")
        .map((a) => a.assignment)
    ),
  ];
  for (const name of committeeNames) {
    const rows = mine.filter(
      (a) => a.type === "classroom_committee" && a.assignment === name
    );
    const people: RosterPerson[] = [];
    let waiting = 0;
    for (const a of rows) {
      const detail =
        a.status === "waitlisted"
          ? `Waitlist #${a.order}`
          : a.role && a.role !== "Member"
            ? a.role
            : "";
      const person = personFrom(a, detail);
      if (person) {
        people.push(person);
        if (a.status === "waitlisted") waiting += 1;
      }
    }
    sections.push({
      id: `committee:${name}`,
      title: name,
      coverage: seatCoverage(
        people.length - waiting,
        rows.find((a) => a.spots !== null)?.spots ?? null
      ),
      summary: null,
      people,
      openSeats: rows.filter((a) => a.status === "unfilled").length,
      emptyMessage: `Nobody is covering ${name} for this room yet.`,
    });
  }

  for (const section of sections) {
    for (const person of section.people) emails.add(person.email.toLowerCase());
  }

  return {
    classroomId,
    classroomName,
    gradeLevel,
    teachers,
    sections,
    peopleCount: emails.size,
  };
}

/**
 * Assemble the whole document. One room or several — a DLI grade's mailing
 * covers both its Red and Blue rooms, and they travel as one file with a page
 * each rather than as two attachments a board member has to remember to attach.
 */
export function buildRosterDocument(params: {
  title: string;
  schoolName: string;
  schoolYear: string;
  exportedOn: string;
  rooms: { id: string; name: string; gradeLevel: string }[];
  assignments: MemberExportAssignment[];
}): RosterDocument {
  return {
    title: params.title,
    schoolName: params.schoolName,
    schoolYear: params.schoolYear,
    exportedOn: params.exportedOn,
    rooms: params.rooms.map((room) =>
      buildRosterRoom(room.id, room.name, room.gradeLevel, params.assignments)
    ),
    disclaimer: CLASSROOM_ROSTER_DISCLAIMER,
    footerNote:
      "Contact details belong to the people who volunteered for this classroom. Use them for classroom coordination only.",
  };
}

/** True when there is nothing worth putting on a page. */
export function rosterDocumentIsEmpty(doc: RosterDocument): boolean {
  return doc.rooms.every(
    (room) =>
      room.teachers.length === 0 &&
      room.sections.every((s) => s.people.length === 0 && s.openSeats === 0)
  );
}
