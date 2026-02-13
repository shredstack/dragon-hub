import { db } from "@/lib/db";
import {
  volunteerSignups,
  classroomMembers,
  schoolMemberships,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

/**
 * Links pending volunteer signups to a user account.
 * Called when a new user creates an account or when an existing user signs in.
 * Creates school memberships and classroom memberships as needed.
 *
 * NOTE: This is extracted from volunteer-signups.ts because it needs to be
 * called from NextAuth events, and server actions ("use server") cannot be
 * imported into middleware context.
 */
export async function linkVolunteerSignupsToUser(userId: string, email: string) {
  // Find unlinked signups for this email
  const unlinkedSignups = await db.query.volunteerSignups.findMany({
    where: and(
      eq(volunteerSignups.email, email.toLowerCase()),
      isNull(volunteerSignups.userId),
      eq(volunteerSignups.status, "active")
    ),
    with: {
      classroom: true,
    },
  });

  if (unlinkedSignups.length === 0) {
    return { linked: 0 };
  }

  // Group by school
  const schoolIds = [...new Set(unlinkedSignups.map((s) => s.schoolId))];

  for (const schoolId of schoolIds) {
    // Create school membership if not exists
    const existingMembership = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
      ),
    });

    if (!existingMembership) {
      await db.insert(schoolMemberships).values({
        userId,
        schoolId,
        role: "member",
        schoolYear: CURRENT_SCHOOL_YEAR,
        status: "approved",
        approvedAt: new Date(),
      });
    }
  }

  // Link signups and create classroom memberships
  for (const signup of unlinkedSignups) {
    // Update the signup to link to user
    await db
      .update(volunteerSignups)
      .set({ userId })
      .where(eq(volunteerSignups.id, signup.id));

    // Create classroom membership
    const classroomRole = signup.role === "room_parent" ? "room_parent" : "volunteer";

    // Check if already a member (prevent duplicates)
    const existingMember = await db.query.classroomMembers.findFirst({
      where: and(
        eq(classroomMembers.userId, userId),
        eq(classroomMembers.classroomId, signup.classroomId)
      ),
    });

    if (!existingMember) {
      await db.insert(classroomMembers).values({
        userId,
        classroomId: signup.classroomId,
        role: classroomRole,
      });
    } else if (classroomRole === "room_parent" && existingMember.role === "volunteer") {
      // Upgrade from volunteer to room_parent if applicable
      await db
        .update(classroomMembers)
        .set({ role: "room_parent" })
        .where(eq(classroomMembers.id, existingMember.id));
    }
  }

  return { linked: unlinkedSignups.length };
}
