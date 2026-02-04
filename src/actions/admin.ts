"use server";

import { assertAuthenticated, assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users, classroomMembers } from "@/lib/db/schema";
import { ilike, or, sql, eq } from "drizzle-orm";

export async function searchUsers(query: string) {
  const user = await assertAuthenticated();
  await assertPtaBoard(user.id!);

  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      or(
        ilike(users.email, `%${query}%`),
        ilike(users.name, `%${query}%`)
      )
    )
    .limit(20);
}

export async function getAllUsersWithRoles() {
  const user = await assertAuthenticated();
  await assertPtaBoard(user.id!);

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      classroomCount: sql<number>`count(distinct ${classroomMembers.classroomId})`,
      roles: sql<string>`string_agg(distinct ${classroomMembers.role}::text, ', ')`,
    })
    .from(users)
    .leftJoin(classroomMembers, eq(users.id, classroomMembers.userId))
    .groupBy(users.id)
    .orderBy(users.name);
}
