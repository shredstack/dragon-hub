/**
 * Turning an audience into the list of emails to send.
 *
 * This is the half of the mail merge that knows the school: which rooms exist,
 * who volunteered in them, which ones are still short of help. It reads, groups,
 * and returns plain data — writing the rows is `src/actions/mailings.ts`, and
 * the wording and the merge are `src/lib/mail-merge-shared.ts`.
 *
 * Everything is scoped to the school's current year. A mailing to last year's
 * room parents is not a thing anyone wants, and the signup and coverage numbers
 * are year-scoped anyway, so a stale room would report as needing help forever.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  classroomMembers,
  classrooms,
  committeeSignups,
  committees,
  schools,
  users,
  volunteerSignups,
} from "@/lib/db/schema";
import { getClassroomTeachersMap } from "@/lib/classroom-teachers";
import { formatTeacherNames } from "@/lib/classroom-teachers-shared";
import { formatGradeLevel, getGradeSortOrder } from "@/lib/grade-levels";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { resolveVolunteerSettings } from "@/lib/volunteer-settings";
import { getAppBaseUrl } from "@/lib/magic-link";
import {
  dedupeRecipients,
  type MailingAudience,
  type MailingRecipient,
} from "@/lib/mail-merge-shared";

/** A group before it becomes a `mailing_groups` row. */
export interface BuiltGroup {
  groupKey: string;
  name: string;
  classroomIds: string[];
  recipients: MailingRecipient[];
  variables: Record<string, string>;
  sortOrder: number;
}

export interface BuildGroupsResult {
  groups: BuiltGroup[];
  /**
   * Rooms the audience matched that produced no recipients at all — a room
   * short of room parents whose teacher has never signed in, say. Surfaced
   * rather than dropped, because "nothing to send" and "we quietly skipped
   * eleven rooms" look identical in a list that only shows what it built.
   */
  emptyGroups: { name: string; reason: string }[];
}

/** One classroom, with everything the builder needs to decide about it. */
interface RoomFacts {
  id: string;
  name: string;
  gradeLevel: string | null;
  isDli: boolean;
  gradeOrder: number;
  teachers: { name: string | null; email: string }[];
  roomParents: { name: string; email: string }[];
  partyVolunteers: { name: string; email: string }[];
  committeeMembers: { name: string; email: string }[];
  roomParentGap: number;
  committeeGap: number;
}

/**
 * Read every fact the builder needs, in a handful of queries rather than one
 * per room. A 30-classroom school would otherwise issue well over a hundred.
 */
async function loadRooms(
  schoolId: string,
  audience: MailingAudience
): Promise<{ rooms: RoomFacts[]; schoolName: string; signupUrl: string | null }> {
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const [school] = await db
    .select({
      name: schools.name,
      volunteerSettings: schools.volunteerSettings,
      volunteerQrCode: schools.volunteerQrCode,
    })
    .from(schools)
    .where(eq(schools.id, schoolId));
  if (!school) throw new Error("School not found");

  const settings = resolveVolunteerSettings(school.volunteerSettings);
  const roomParentLimit = settings.roomParentLimit;

  // Active rooms taking signups. `excludeFromSignup` hides groups like the PTA
  // Board's own pseudo-classroom, which has no families to email.
  const roomRows = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      isDli: classrooms.isDli,
      active: classrooms.active,
      excludeFromSignup: classrooms.excludeFromSignup,
    })
    .from(classrooms)
    .where(
      and(eq(classrooms.schoolId, schoolId), eq(classrooms.schoolYear, schoolYear))
    );

  let eligible = roomRows.filter(
    (r) => r.active !== false && !r.excludeFromSignup
  );
  if (audience.classroomIds && audience.classroomIds.length > 0) {
    const wanted = new Set(audience.classroomIds);
    eligible = eligible.filter((r) => wanted.has(r.id));
  }
  if (eligible.length === 0) {
    return { rooms: [], schoolName: school.name, signupUrl: null };
  }

  const roomIds = eligible.map((r) => r.id);
  const teacherMap = await getClassroomTeachersMap(roomIds);

  // A signed-in teacher's own name beats the one the board typed, and beats the
  // bare address that is all `classroom_teachers` holds until someone fills the
  // name in. This matters more here than anywhere else in the app: every other
  // surface showing "garcia@draper.edu" is an admin screen, whereas this one
  // puts it in the greeting of an email to families.
  const linkedTeachers = await db
    .select({ email: users.email, name: users.name })
    .from(classroomMembers)
    .innerJoin(users, eq(classroomMembers.userId, users.id))
    .where(
      and(
        inArray(classroomMembers.classroomId, roomIds),
        eq(classroomMembers.role, "teacher")
      )
    );
  const linkedNameByEmail = new Map<string, string>();
  for (const row of linkedTeachers) {
    if (row.email && row.name) {
      linkedNameByEmail.set(row.email.trim().toLowerCase(), row.name);
    }
  }

  const volunteerRows = await db
    .select({
      classroomId: volunteerSignups.classroomId,
      name: volunteerSignups.name,
      email: volunteerSignups.email,
      role: volunteerSignups.role,
    })
    .from(volunteerSignups)
    .where(
      and(
        inArray(volunteerSignups.classroomId, roomIds),
        eq(volunteerSignups.status, "active")
      )
    );

  // Committee seats, only when a committee is in scope. `perClassroomLimit` is
  // what a room's coverage is measured against — a school-wide `maxSize` says
  // nothing about whether Room 12 is covered.
  let committeeRows: { classroomId: string | null; name: string; email: string }[] =
    [];
  let perClassroomLimit = 0;
  if (audience.committeeId) {
    const [committee] = await db
      .select({ perClassroomLimit: committees.perClassroomLimit })
      .from(committees)
      .where(
        and(
          eq(committees.id, audience.committeeId),
          eq(committees.schoolId, schoolId)
        )
      );
    perClassroomLimit = committee?.perClassroomLimit ?? 0;

    committeeRows = await db
      .select({
        classroomId: committeeSignups.classroomId,
        name: committeeSignups.name,
        email: committeeSignups.email,
      })
      .from(committeeSignups)
      .where(
        and(
          eq(committeeSignups.committeeId, audience.committeeId),
          eq(committeeSignups.schoolId, schoolId),
          eq(committeeSignups.status, "active")
        )
      );
  }

  const byRoom = <T extends { classroomId: string | null }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      if (!row.classroomId) continue;
      const list = map.get(row.classroomId) ?? [];
      list.push(row);
      map.set(row.classroomId, list);
    }
    return map;
  };

  const volunteersByRoom = byRoom(volunteerRows);
  const committeeByRoom = byRoom(committeeRows);

  const rooms: RoomFacts[] = eligible.map((room) => {
    const volunteers = volunteersByRoom.get(room.id) ?? [];
    const roomParents = volunteers
      .filter((v) => v.role === "room_parent")
      .map((v) => ({ name: v.name, email: v.email }));
    const partyVolunteers = volunteers
      .filter((v) => v.role === "party_volunteer")
      .map((v) => ({ name: v.name, email: v.email }));
    const committeeMembers = (committeeByRoom.get(room.id) ?? []).map((c) => ({
      name: c.name,
      email: c.email,
    }));

    return {
      id: room.id,
      name: room.name,
      gradeLevel: room.gradeLevel,
      isDli: room.isDli === true,
      gradeOrder: getGradeSortOrder(room.gradeLevel),
      teachers: (teacherMap.get(room.id) ?? []).map((t) => ({
        name: linkedNameByEmail.get(t.email) ?? t.name,
        email: t.email,
      })),
      roomParents,
      partyVolunteers,
      committeeMembers,
      roomParentGap: Math.max(0, roomParentLimit - roomParents.length),
      committeeGap: Math.max(0, perClassroomLimit - committeeMembers.length),
    };
  });

  const signupUrl = school.volunteerQrCode
    ? `${getAppBaseUrl()}/volunteer-signup/${school.volunteerQrCode}`
    : null;

  return { rooms, schoolName: school.name, signupUrl };
}

/** Whether a room survives the coverage filter. */
function passesCoverage(room: RoomFacts, audience: MailingAudience): boolean {
  switch (audience.coverage) {
    case "needs_room_parents":
      return room.roomParentGap > 0;
    case "needs_committee":
      return room.committeeGap > 0;
    case "needs_any":
      return room.roomParentGap > 0 || room.committeeGap > 0;
    case "all":
    default:
      return true;
  }
}

/** The people in these rooms the audience asked for, deduped across rooms. */
function recipientsFor(
  rooms: RoomFacts[],
  audience: MailingAudience
): MailingRecipient[] {
  const out: MailingRecipient[] = [];
  for (const room of rooms) {
    if (audience.recipientRoles.includes("teachers")) {
      for (const t of room.teachers) {
        // A teacher's display name is a placeholder the board typed until the
        // account exists; the address is the part that must be right.
        out.push({ name: t.name ?? t.email, email: t.email, role: "teachers" });
      }
    }
    if (audience.recipientRoles.includes("room_parents")) {
      for (const p of room.roomParents) {
        out.push({ ...p, role: "room_parents" });
      }
    }
    if (audience.recipientRoles.includes("party_volunteers")) {
      for (const p of room.partyVolunteers) {
        out.push({ ...p, role: "party_volunteers" });
      }
    }
    if (audience.recipientRoles.includes("committee_members")) {
      for (const p of room.committeeMembers) {
        out.push({ ...p, role: "committee_members" });
      }
    }
  }
  return dedupeRecipients(out);
}

/** First name only, for a greeting. Falls back to the whole string. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "A, B and C" — the Oxford-less list every one of these variables uses. */
function joinNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

function buildVariables(params: {
  groupName: string;
  rooms: RoomFacts[];
  recipients: MailingRecipient[];
  schoolName: string;
  senderName: string;
  signupUrl: string | null;
}): Record<string, string> {
  const { groupName, rooms, recipients, schoolName, senderName, signupUrl } =
    params;

  const teacherNames = formatTeacherNames(
    rooms.flatMap((r) => r.teachers.map((t) => ({ name: t.name, email: t.email })))
  );
  const teacherFirsts = joinNames(
    rooms
      .flatMap((r) => r.teachers)
      .map((t) => (t.name ? firstName(t.name) : t.email))
  );
  const grades = joinNames(
    Array.from(
      new Set(
        rooms
          .map((r) => formatGradeLevel(r.gradeLevel))
          .filter((g): g is string => !!g)
      )
    )
  );

  const roomParentGap = rooms.reduce((n, r) => n + r.roomParentGap, 0);
  const committeeGap = rooms.reduce((n, r) => n + r.committeeGap, 0);

  return {
    group: groupName,
    classrooms: joinNames(rooms.map((r) => r.name)),
    grades,
    teachers: teacherNames,
    teacher_first_names: teacherFirsts,
    room_parents: joinNames(rooms.flatMap((r) => r.roomParents.map((p) => p.name))),
    recipient_names: joinNames(recipients.map((r) => firstName(r.name))),
    room_parent_gap: String(roomParentGap),
    committee_gap: String(committeeGap),
    signup_link: signupUrl ?? "",
    school: schoolName,
    sender: senderName,
    // `note` is per-group and edited by hand, so it is merged at render time
    // rather than frozen here — see `renderGroup` in `mail-merge-render.ts`.
  };
}

/**
 * Build the groups for an audience.
 *
 * Grouping happens over rooms that already passed the coverage filter, which is
 * the order that matters: "one email per grade, only for grades still short of
 * room parents" should produce a group for the grade if *either* of its DLI
 * rooms needs help, and that falls out of filtering first.
 */
export async function buildMailingGroups(params: {
  schoolId: string;
  audience: MailingAudience;
  senderName: string;
}): Promise<BuildGroupsResult> {
  const { schoolId, audience, senderName } = params;
  const { rooms, schoolName, signupUrl } = await loadRooms(schoolId, audience);

  const matching = rooms.filter((r) => passesCoverage(r, audience));
  if (matching.length === 0) return { groups: [], emptyGroups: [] };

  /** Rooms bundled into one group, in the order they'll be listed. */
  const bundles: { key: string; name: string; rooms: RoomFacts[]; sort: number }[] =
    [];

  if (audience.grouping === "single") {
    bundles.push({ key: "all", name: "Everyone", rooms: matching, sort: 0 });
  } else if (audience.grouping === "dli_split") {
    const dli = matching.filter((r) => r.isDli);
    const rest = matching.filter((r) => !r.isDli);
    if (dli.length > 0) {
      bundles.push({ key: "dli", name: "DLI classrooms", rooms: dli, sort: 0 });
    }
    if (rest.length > 0) {
      bundles.push({
        key: "non_dli",
        name: "Non-DLI classrooms",
        rooms: rest,
        sort: 1,
      });
    }
  } else if (audience.grouping === "dli_grade") {
    // DLI rooms pair by grade; everything else stays one room per email. Grade
    // identity is the sort order, never the label — `grade_level` is free text
    // and "1st" and "1st Grade" both exist in production.
    const dliByGrade = new Map<number, RoomFacts[]>();
    for (const room of matching) {
      if (!room.isDli || room.gradeOrder >= 998) continue;
      const list = dliByGrade.get(room.gradeOrder) ?? [];
      list.push(room);
      dliByGrade.set(room.gradeOrder, list);
    }
    for (const [order, group] of dliByGrade) {
      bundles.push({
        key: `grade:${order}`,
        name: `${formatGradeLevel(group[0].gradeLevel) || "Grade"} — ${joinNames(
          group.map((r) => r.name)
        )}`,
        rooms: group,
        sort: order,
      });
    }
    for (const room of matching) {
      if (room.isDli && room.gradeOrder < 998) continue;
      bundles.push({
        key: `room:${room.id}`,
        name: room.name,
        rooms: [room],
        sort: room.gradeOrder,
      });
    }
  } else {
    for (const room of matching) {
      bundles.push({
        key: `room:${room.id}`,
        name: room.name,
        rooms: [room],
        sort: room.gradeOrder,
      });
    }
  }

  bundles.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const groups: BuiltGroup[] = [];
  const emptyGroups: BuildGroupsResult["emptyGroups"] = [];

  bundles.forEach((bundle, index) => {
    const recipients = recipientsFor(bundle.rooms, audience);
    if (recipients.length === 0) {
      emptyGroups.push({
        name: bundle.name,
        reason:
          "Nobody in this group holds one of the roles you picked, or none of them has an email on file.",
      });
      return;
    }
    groups.push({
      groupKey: bundle.key,
      name: bundle.name,
      classroomIds: bundle.rooms.map((r) => r.id),
      recipients,
      variables: buildVariables({
        groupName: bundle.name,
        rooms: bundle.rooms,
        recipients,
        schoolName,
        senderName,
        signupUrl,
      }),
      sortOrder: index,
    });
  });

  return { groups, emptyGroups };
}
