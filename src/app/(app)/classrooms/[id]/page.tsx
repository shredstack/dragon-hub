import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  classrooms,
  classroomMembers,
  classroomMessages,
  classroomTasks,
  roomParents,
  users,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ClassroomTabs } from "@/components/classrooms/classroom-tabs";
import { MessageBoard } from "@/components/classrooms/message-board";
import { TaskList } from "@/components/classrooms/task-list";
import { Roster } from "@/components/classrooms/roster";
import { RoomParents } from "@/components/classrooms/room-parents";

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
  ]);

  const canCreateTask =
    membership.role === "teacher" || membership.role === "room_parent";

  const canManageRoomParents =
    membership.role === "teacher" || membership.role === "room_parent" || membership.role === "pta_board";

  const formattedMessages = messages.map((m) => ({
    id: m.id,
    message: m.message,
    createdAt: m.createdAt?.toISOString() ?? new Date().toISOString(),
    authorId: m.authorId,
    author: m.authorName
      ? { name: m.authorName, email: m.authorEmail ?? "" }
      : null,
  }));

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
          <MessageBoard
            classroomId={id}
            messages={formattedMessages}
            currentUserId={userId}
          />
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
          <RoomParents
            classroomId={id}
            roomParents={classroomRoomParents}
            canManage={canManageRoomParents}
          />
        }
      />
    </div>
  );
}
