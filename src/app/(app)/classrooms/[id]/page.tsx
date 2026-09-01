import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPtaBoardMember, isSchoolLeadership } from "@/lib/auth-helpers";
import { isDliPartnerMember } from "@/lib/dli-partners";
import {
  classrooms,
  classroomMembers,
  classroomMessages,
  classroomTasks,
  committees,
  committeeSignups,
  users,
  volunteerSignups,
} from "@/lib/db/schema";
import { eq, and, desc, inArray, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ClassroomEmojiButton } from "@/components/classrooms/classroom-emoji-button";
import { ClassroomTabs } from "@/components/classrooms/classroom-tabs";
import { MessageBoard } from "@/components/classrooms/message-board";
import { MessageBoardWithTabs } from "@/components/classrooms/message-board-tabs";
import { TaskList } from "@/components/classrooms/task-list";
import { VolunteersSection } from "@/components/classrooms/volunteers-section";
import { USER_ROLES } from "@/lib/constants";
import {
  isUserRoomParentForClassroom,
  isUserTeacherForClassroom,
} from "@/actions/volunteer-signups";

import type { Metadata } from "next";
import { getClassroomTitle, privateMetadata } from "@/lib/page-metadata";
import { getClassroomTeachers } from "@/lib/classroom-teachers";
import {
  formatTeacherNames,
  teacherDisplayName,
} from "@/lib/classroom-teachers-shared";

interface ClassroomPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ClassroomPageProps): Promise<Metadata> {
  const { id } = await params;
  const title = await getClassroomTitle(id);
  return privateMetadata(title ?? "Classroom");
}

export default async function ClassroomPage({ params }: ClassroomPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  // Check membership
  const membership = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.classroomId, id),
      eq(classroomMembers.userId, userId)
    ),
  });

  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, id),
  });

  if (!classroom) notFound();

  const teachers = await getClassroomTeachers(classroom.id);

  // No row of their own is not the same as no access: PTA board and school
  // admins are virtual members of every classroom, which is what lets them read
  // and post in a room they never joined. Scoped to the classroom's own school
  // so leadership at one school can't walk into another's rooms by id.
  //
  // The DLI partner is the other no-row case: a 1st grade Blue room parent
  // reaching 1st grade Red, whose parties their own room throws jointly. Like
  // leadership they hold no role here, so every `membership?.role` check below
  // correctly refuses them the room's controls. See `dli-partners.ts`.
  let viaDliPartner = false;
  if (!membership) {
    const canParticipate =
      classroom.schoolId &&
      (await isSchoolLeadership(userId, classroom.schoolId));
    if (!canParticipate) {
      viaDliPartner = await isDliPartnerMember(userId, id);
      if (!viaDliPartner) notFound();
    }
  }

  // Check if user has access to private room parent board
  const [isRoomParent, isTeacher] = await Promise.all([
    isUserRoomParentForClassroom(userId, id),
    isUserTeacherForClassroom(userId, id),
  ]);
  const canAccessPrivateBoard = isRoomParent || isTeacher;

  // Fetch data in parallel
  const [
    messages,
    tasks,
    members,
    classroomVolunteerSignups,
    classroomCommitteeSignups,
  ] = await Promise.all([
    db
      .select({
        id: classroomMessages.id,
        message: classroomMessages.message,
        createdAt: classroomMessages.createdAt,
        authorId: classroomMessages.authorId,
        authorName: users.name,
        authorEmail: users.email,
        accessLevel: classroomMessages.accessLevel,
      })
      .from(classroomMessages)
      .leftJoin(users, eq(classroomMessages.authorId, users.id))
      .where(eq(classroomMessages.classroomId, id))
      .orderBy(classroomMessages.createdAt),
    db
      .select({
        id: classroomTasks.id,
        title: classroomTasks.title,
        description: classroomTasks.description,
        completed: classroomTasks.completed,
        dueDate: classroomTasks.dueDate,
        createdAt: classroomTasks.createdAt,
        assigneeId: classroomTasks.assignedTo,
        assigneeName: users.name,
      })
      .from(classroomTasks)
      .leftJoin(users, eq(classroomTasks.assignedTo, users.id))
      .where(eq(classroomTasks.classroomId, id))
      .orderBy(desc(classroomTasks.createdAt)),
    db
      .select({
        id: classroomMembers.id,
        userId: classroomMembers.userId,
        role: classroomMembers.role,
        userName: users.name,
        userEmail: users.email,
        userPhone: users.phone,
      })
      .from(classroomMembers)
      .innerJoin(users, eq(classroomMembers.userId, users.id))
      .where(eq(classroomMembers.classroomId, id)),
    // Volunteer signups are the record of who volunteered; classroom members
    // below are the accounts that record has granted access to.
    //
    // Waitlisted rows are read too, for the same reason the committee query
    // below reads them: a room that has filled its two spots still wants to
    // know who else put their name down, because the room parent limit is a
    // recruiting tool rather than a cap on how many adults may help. Only
    // `room_parent` rows are ever waitlisted — party volunteers have no wall.
    db.query.volunteerSignups.findMany({
      where: and(
        eq(volunteerSignups.classroomId, id),
        inArray(volunteerSignups.status, ["active", "waitlisted"])
      ),
      // Anyone in the room reaches this page, including a DLI partner. Student
      // names are the PTA board's alone, so they never enter the request — the
      // projection further down would drop them, but the rule is only real if
      // it holds at the query. See `src/lib/students-shared.ts`.
      columns: { students: false },
    }),
    // Per-classroom committees covering this room (Meet the Masters under Room
    // 12). Read from `committee_signups` rather than from `classroom_members`
    // on purpose: an MTM-only signup produces no membership row, so a roster
    // built from memberships omitted these parents from the room altogether.
    db
      .select({
        id: committeeSignups.id,
        name: committeeSignups.name,
        email: committeeSignups.email,
        phone: committeeSignups.phone,
        status: committeeSignups.status,
        committeeId: committees.id,
        committeeName: committees.name,
        committeeEmoji: committees.iconEmoji,
      })
      .from(committeeSignups)
      .innerJoin(committees, eq(committeeSignups.committeeId, committees.id))
      .where(
        and(
          eq(committeeSignups.classroomId, id),
          inArray(committeeSignups.status, ["active", "waitlisted"]),
          isNull(committees.archivedAt)
        )
      ),
  ]);

  const committeeVolunteers = classroomCommitteeSignups.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    committeeId: c.committeeId,
    committeeName: c.committeeName,
    committeeEmoji: c.committeeEmoji,
    waitlisted: c.status === "waitlisted",
  }));

  const signupRoomParents = classroomVolunteerSignups
    .filter((v) => v.role === "room_parent" && v.status === "active")
    .map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      source: "signup" as const,
      waitlistPosition: null,
    }));

  // In promotion order, not by name — a waitlist sorted alphabetically is a
  // waitlist that lies about who is next. Same sort as the VP dashboard's.
  const waitlistedRoomParents = classroomVolunteerSignups
    .filter((v) => v.role === "room_parent" && v.status === "waitlisted")
    .sort(
      (a, b) =>
        (a.waitlistedAt?.getTime() ?? Infinity) -
        (b.waitlistedAt?.getTime() ?? Infinity)
    )
    .map((v, index) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      source: "signup" as const,
      waitlistPosition: index + 1,
    }));

  const partyVolunteers = classroomVolunteerSignups
    .filter((v) => v.role === "party_volunteer" && v.status === "active")
    .map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      partyTypes: v.partyTypes || [],
    }));

  // Get room parents from classroom members (users with role "room_parent")
  const memberRoomParents = members
    .filter((m) => m.role === "room_parent")
    .map((m) => ({
      id: m.id,
      name: m.userName ?? m.userEmail ?? "Unknown",
      email: m.userEmail,
      phone: m.userPhone,
      source: "member" as const,
      waitlistPosition: null,
    }));

  // A room parent who signed up and has since signed in exists both as a signup
  // and as a classroom member. Show the signup row — it's the editable one —
  // and keep member rows only for people added straight to the roster.
  const signupEmails = new Set(
    signupRoomParents.map((rp) => rp.email.toLowerCase())
  );
  const seatedRoomParents = [
    ...signupRoomParents,
    ...memberRoomParents.filter(
      (m) => !m.email || !signupEmails.has(m.email.toLowerCase())
    ),
  ];

  // Anyone waiting goes last, and never twice: a waitlisted row for someone who
  // already holds a seat here shouldn't exist (`volunteer_signups_unique_open`
  // allows one open row per classroom/email/role), but a member row is not a
  // signup row, so the check is cheap insurance rather than dead code.
  const seatedEmails = new Set(
    seatedRoomParents
      .map((rp) => rp.email?.toLowerCase())
      .filter((email): email is string => !!email)
  );
  const allRoomParents = [
    ...seatedRoomParents,
    ...waitlistedRoomParents.filter(
      (rp) => !seatedEmails.has(rp.email.toLowerCase())
    ),
  ];

  // The room's teachers for the roster tab. The list on the classroom is the
  // source, so a teacher who hasn't signed in yet is still on the roster; the
  // account, where there is one, only supplies the name it wants to be called.
  const memberNamesByEmail = new Map(
    members
      .filter((m) => m.userEmail && m.userName)
      .map((m) => [m.userEmail!.toLowerCase(), m.userName!] as const)
  );
  const rosterTeachers = teachers.map((t) => ({
    id: t.id,
    name: memberNamesByEmail.get(t.email) ?? teacherDisplayName(t),
    email: t.email,
  }));

  // Whoever holds a `classroom_members` row and appears in none of the groups
  // above — a board member put straight onto the roster, most likely. This
  // used to be the whole of the separate "Roster" tab; keeping the leftovers
  // is what lets that tab go without anybody quietly dropping off the room.
  const listedEmails = new Set(
    [
      ...teachers.map((t) => t.email),
      ...allRoomParents.map((rp) => rp.email),
      ...partyVolunteers.map((pv) => pv.email),
      ...committeeVolunteers.map((cv) => cv.email),
    ]
      .filter((email): email is string => !!email)
      .map((email) => email.toLowerCase())
  );
  const otherMembers = members
    .filter((m) => !m.userEmail || !listedEmails.has(m.userEmail.toLowerCase()))
    .map((m) => ({
      id: m.id,
      name: m.userName ?? m.userEmail ?? "Unknown",
      email: m.userEmail,
      phone: m.userPhone,
      roleLabel: USER_ROLES[m.role as keyof typeof USER_ROLES] ?? m.role,
    }));

  // A virtual member has no row and therefore no role — deliberately. Running
  // the classroom stays with the people who actually run it, matching
  // `assertClassroomRole`, which refuses them server-side. Showing these
  // controls would only produce a button that throws.
  const canCreateTask =
    membership?.role === "teacher" || membership?.role === "room_parent";

  const canManageRoomParents =
    membership?.role === "teacher" ||
    membership?.role === "room_parent" ||
    membership?.role === "pta_board";

  // Taking a copy of the room's contact list is the room's own team, plus
  // leadership — not the DLI partner, who is here to coordinate a shared party
  // and can already see the same people on this page. `viaDliPartner` is the
  // only no-row case left by the time we get here, since leadership was checked
  // first. The server action decides this again; this is what to show.
  const canExportRoster = !!membership || !viaDliPartner;

  // Student names in that copy are the PTA board's alone — a tighter line than
  // the export itself, and tighter than the participation line school admins
  // sit on everywhere else. This only decides whether the checkbox is offered;
  // `exportClassroomRoster` recomputes the same answer on every call. See
  // `src/lib/students-shared.ts`.
  const canExportRosterStudents =
    canExportRoster &&
    !!classroom.schoolId &&
    (await isPtaBoardMember(userId, classroom.schoolId));

  // Picking the room's emoji is decoration, so it's open to everyone in the
  // room whatever their role, plus leadership — the same set as the export
  // above, and for the same reason the DLI partner is left out of it.
  const canSetEmoji = canExportRoster;

  const formattedMessages = messages
    .filter((m) => {
      // Filter out private messages if user doesn't have access
      if (m.accessLevel === "room_parents_only" && !canAccessPrivateBoard) {
        return false;
      }
      return true;
    })
    .map((m) => ({
      id: m.id,
      message: m.message,
      createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
      authorId: m.authorId,
      author: m.authorName
        ? { name: m.authorName, email: m.authorEmail ?? "" }
        : null,
      accessLevel: m.accessLevel,
    }));

  // Split messages by access level
  const publicMessages = formattedMessages.filter(
    (m) => m.accessLevel === "public"
  );
  const privateMessages = formattedMessages.filter(
    (m) => m.accessLevel === "room_parents_only"
  );

  const formattedTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    completed: t.completed ?? false,
    dueDate: t.dueDate?.toISOString() ?? null,
    assignee: t.assigneeName ? { name: t.assigneeName } : null,
    creator: null,
  }));

  const formattedMembers = members.map((m) => ({
    userId: m.userId,
    userName: m.userName ?? m.userEmail,
    role: m.role,
    user: { name: m.userName, email: m.userEmail, phone: m.userPhone },
  }));

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-start gap-3">
          <ClassroomEmojiButton
            classroomId={classroom.id}
            classroomName={classroom.name}
            iconEmoji={classroom.iconEmoji}
            canEdit={canSetEmoji}
          />
          <div>
            <h1 className="text-2xl font-bold">{classroom.name}</h1>
            <p className="text-muted-foreground">
              {classroom.gradeLevel && `${classroom.gradeLevel} · `}
              {classroom.schoolYear}
            </p>
            {/* Both of them on a half-day room — the name a parent came here
                looking for, ahead of anything else on the page. */}
            {teachers.length > 0 && (
              <p className="text-muted-foreground text-sm">
                {teachers.length === 1 ? "Teacher" : "Teachers"}:{" "}
                {formatTeacherNames(teachers)}
              </p>
            )}
          </div>
        </div>
        {viaDliPartner && (
          <p className="border-border bg-muted/50 text-muted-foreground mt-3 rounded-md border px-3 py-2 text-sm">
            You&apos;re seeing this room because it&apos;s the DLI partner of
            your own {classroom.gradeLevel ?? ""} classroom. You can read and
            post here; the room&apos;s own team manages its roster and tasks.
          </p>
        )}
      </div>

      <ClassroomTabs
        messagesContent={
          canAccessPrivateBoard ? (
            <MessageBoardWithTabs
              classroomId={id}
              publicMessages={publicMessages}
              privateMessages={privateMessages}
              currentUserId={userId}
            />
          ) : (
            <MessageBoard
              classroomId={id}
              messages={publicMessages}
              currentUserId={userId}
            />
          )
        }
        tasksContent={
          <TaskList
            classroomId={id}
            tasks={formattedTasks}
            canCreateTask={canCreateTask}
            classroomMembers={formattedMembers.map((m) => ({
              userId: m.userId,
              userName: m.userName,
            }))}
          />
        }
        rosterContent={
          <VolunteersSection
            classroomId={id}
            classroomName={classroom.name}
            schoolYear={classroom.schoolYear}
            teachers={rosterTeachers}
            roomParents={allRoomParents}
            partyVolunteers={partyVolunteers}
            committeeVolunteers={committeeVolunteers}
            otherMembers={otherMembers}
            canManage={canManageRoomParents}
            canExport={canExportRoster}
            canExportStudents={canExportRosterStudents}
          />
        }
      />
    </div>
  );
}
