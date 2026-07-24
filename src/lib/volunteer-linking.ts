import { db } from "@/lib/db";
import {
  volunteerSignups,
  schoolMemberships,
} from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { ensureClassroomMembership } from "@/lib/volunteer-onboarding";

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
    // Join the school for ITS active year, not a global constant.
    const schoolYear = await getSchoolCurrentYear(schoolId);

    // Create school membership if not exists
    const existingMembership = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear)
      ),
    });

    if (!existingMembership) {
      await db.insert(schoolMemberships).values({
        userId,
        schoolId,
        role: "member",
        schoolYear: schoolYear,
        status: "approved",
        source: "volunteer_signup",
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

    await ensureClassroomMembership(userId, signup.classroomId, signup.role);
  }

  return { linked: unlinkedSignups.length };
}
