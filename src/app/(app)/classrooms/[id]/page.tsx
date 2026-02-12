import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  classrooms,
  classroomMembers,
  classroomMessages,
  classroomTasks,
  roomParents,
  users,
  volunteerSignups,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ClassroomTabs } from "@/components/classrooms/classroom-tabs";
import { MessageBoard } from "@/components/classrooms/message-board";
import { MessageBoardWithTabs } from "@/components/classrooms/message-board-tabs";
import { TaskList } from "@/components/classrooms/task-list";
import { Roster } from "@/components/classrooms/roster";
import { VolunteersSection } from "@/components/classrooms/volunteers-section";
import {
  isUserRoomParentForClassroom,
  isUserTeacherForClassroom,
} from "@/actions/volunteer-signups";

interface ClassroomPageProps {
  params: Promise<{ id: string }>;
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

  if (!membership) notFound();

  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, id),
  });

  if (!classroom) notFound();

  // Check if user has access to private room parent board
  const [isRoomParent, isTeacher] = await Promise.all([
    isUserRoomParentForClassroom(userId, id),
    isUserTeacherForClassroom(userId, id),
  ]);
  const canAccessPrivateBoard = isRoomParent || isTeacher;

  // Fetch data in parallel
  const [messages, tasks, members, classroomRoomParents] = await Promise.all([
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
        userId: classroomMembers.userId,
        role: classroomMembers.role,
        userName: users.name,
        userEmail: users.email,
      })
      .from(classroomMembers)
      .innerJoin(users, eq(classroomMembers.userId, users.id))
      .where(eq(classroomMembers.classroomId, id)),
    db
      .select({
        id: roomParents.id,
        name: roomParents.name,
        email: roomParents.email,
        phone: roomParents.phone,
      })
      .from(roomParents)
      .where(eq(roomParents.classroomId, id)),
    // Fetch volunteer signups from the new system
    db.query.volunteerSignups.findMany({
      where: and(
        eq(volunteerSignups.classroomId, id),
        eq(volunteerSignups.status, "active")
      ),
    }),
  ]);

  // Process volunteer signups
  const classroomVolunteerSignups = await db.query.volunteerSignups.findMany({
    where: and(
      eq(volunteerSignups.classroomId, id),
      eq(volunteerSignups.status, "active")
    ),
  });

  const signupRoomParents = classroomVolunteerSignups
    .filter((v) => v.role === "room_parent")
    .map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      source: "signup" as const,
    }));

  const partyVolunteers = classroomVolunteerSignups
    .filter((v) => v.role === "party_volunteer")
    .map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      partyTypes: v.partyTypes || [],
    }));

  // Combine legacy room parents with signup room parents
  const allRoomParents = [
    ...classroomRoomParents.map((rp) => ({ ...rp, source: "legacy" as const })),
    ...signupRoomParents,
  ];

  const canCreateTask =
    membership.role === "teacher" || membership.role === "room_parent";

  const canManageRoomParents =
    membership.role === "teacher" || membership.role === "room_parent" || membership.role === "pta_board";

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
    user: { name: m.userName, email: m.userEmail },
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{classroom.name}</h1>
        <p className="text-muted-foreground">
          {classroom.gradeLevel && `${classroom.gradeLevel} · `}
          {classroom.schoolYear}
        </p>
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
        rosterContent={<Roster members={formattedMembers} />}
        roomParentsContent={
          <VolunteersSection
            classroomId={id}
            roomParents={allRoomParents}
            partyVolunteers={partyVolunteers}
            canManage={canManageRoomParents}
          />
        }
      />
    </div>
  );
}
