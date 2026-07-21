"use server";

import {
  assertAuthenticated,
  getSchoolByJoinCode,
  getUserSchoolMembership,
  setCurrentSchoolId,
  assertSchoolMember,
  isSchoolAdmin,
  isSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schoolMemberships, schools } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSchoolCurrentYear } from "@/lib/school-year";
import type { SchoolRole, PtaBoardPosition } from "@/types";

export async function joinSchool(joinCode: string) {
  const user = await assertAuthenticated();

  // Normalize the join code (uppercase, trim)
  const normalizedCode = joinCode.trim().toUpperCase();

  // Find the school by join code
  const school = await getSchoolByJoinCode(normalizedCode);

  if (!school) {
    return {
      success: false,
      error: "We couldn't find a school with that code. Please check the code and try again.",
    };
  }

  // Always join for the school's OWN active year, never a global constant.
  const schoolYear = await getSchoolCurrentYear(school.id);

  // Check if user already has a membership for this school/year
  const existingMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.schoolId, school.id),
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolYear, schoolYear)
    ),
  });

  if (existingMembership) {
    if (existingMembership.status === "approved") {
      // Already a member, just set the cookie and return
      await setCurrentSchoolId(school.id);
      return { success: true, school, alreadyMember: true };
    } else if (existingMembership.status === "revoked") {
      return {
        success: false,
        error: "Your access to this school has been revoked. Please contact a school administrator.",
      };
    } else if (existingMembership.status === "expired") {
      // Renew the membership
      await db
        .update(schoolMemberships)
        .set({
          status: "approved",
          approvedAt: new Date(),
          renewedFrom: existingMembership.id,
        })
        .where(eq(schoolMemberships.id, existingMembership.id));

      await setCurrentSchoolId(school.id);
      revalidatePath("/dashboard");
      return { success: true, school, renewed: true };
    } else if (existingMembership.status === "removed") {
      // Taken off the roster by the board, but not barred — a valid code lets
      // them back in. They return as a plain member: whatever role or board
      // position they held before is deliberately not restored, so rejoining
      // can never hand back admin access the board just took away.
      await db
        .update(schoolMemberships)
        .set({
          status: "approved",
          role: "member",
          boardPosition: null,
          approvedAt: new Date(),
        })
        .where(eq(schoolMemberships.id, existingMembership.id));

      await setCurrentSchoolId(school.id);
      revalidatePath("/dashboard");
      return { success: true, school, rejoined: true };
    }
  }

  // Create new membership (auto-approved since they have the code)
  await db.insert(schoolMemberships).values({
    schoolId: school.id,
    userId: user.id!,
    role: "member",
    schoolYear,
    status: "approved",
    approvedAt: new Date(),
  });

  // Set the current school cookie
  await setCurrentSchoolId(school.id);

  revalidatePath("/dashboard");
  return { success: true, school };
}

export async function getCurrentUserSchool() {
  const user = await assertAuthenticated();
  return getUserSchoolMembership(user.id!);
}

export async function leaveSchool(schoolId: string) {
  const user = await assertAuthenticated();

  // Verify they're a member
  await assertSchoolMember(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Update status to revoked (self-revoked)
  await db
    .update(schoolMemberships)
    .set({ status: "revoked" })
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.userId, user.id!),
        eq(schoolMemberships.schoolYear, schoolYear)
      )
    );

  revalidatePath("/dashboard");
  return { success: true };
}

export async function getSchoolMembers(schoolId: string) {
  const user = await assertAuthenticated();

  // Only PTA board or admin can view members
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: You don't have access to view members");
  }

  const schoolYear = await getSchoolCurrentYear(schoolId);

  return db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved")
    ),
    with: {
      user: true,
    },
  });
}

export async function updateMemberRole(
  schoolId: string,
  membershipId: string,
  role: SchoolRole,
  boardPosition?: PtaBoardPosition | null
) {
  const user = await assertAuthenticated();

  // Only school admins (or super admins) can change roles. Checked without a
  // year filter so a rollover in progress can't strip an admin's ability to fix
  // the roster.
  const canManage = await isSchoolAdmin(user.id!, schoolId);
  if (!canManage) {
    throw new Error("Unauthorized: Only school admins can change member roles");
  }

  // Prevent admin from changing their own role
  const targetMembership = await db.query.schoolMemberships.findFirst({
    where: eq(schoolMemberships.id, membershipId),
  });

  if (targetMembership?.userId === user.id) {
    throw new Error("You cannot change your own role");
  }

  // Clear board position if role is not pta_board
  const finalBoardPosition = role === "pta_board" ? (boardPosition ?? null) : null;

  await db
    .update(schoolMemberships)
    .set({ role, boardPosition: finalBoardPosition })
    .where(eq(schoolMemberships.id, membershipId));

  revalidatePath("/admin/members");
  return { success: true };
}

/**
 * Takes someone off this school's roster for the current year.
 *
 * Deliberately NOT a deletion and not a revocation: the account and everything
 * attached to it (volunteer hours, past messages, other schools) survives, and
 * they can come back on their own with the join code or by signing up for a
 * room parent / volunteer slot. Use `revoked` only when re-entry should require
 * an administrator.
 */
export async function removeMember(schoolId: string, membershipId: string) {
  const user = await assertAuthenticated();

  // Only school admin or PTA board can remove members
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: You don't have permission to remove members");
  }

  const membership = await db.query.schoolMemberships.findFirst({
    where: eq(schoolMemberships.id, membershipId),
  });

  if (!membership || membership.schoolId !== schoolId) {
    throw new Error("Member not found in this school");
  }

  // Removing yourself would drop your own board access with no way back in
  // short of the join code; leaveSchool is the intentional path for that.
  if (membership.userId === user.id) {
    throw new Error("You cannot remove yourself from the school");
  }

  await db
    .update(schoolMemberships)
    .set({ status: "removed", boardPosition: null })
    .where(eq(schoolMemberships.id, membershipId));

  revalidatePath("/admin/members");
  return { success: true };
}

export async function getSchoolInfo(schoolId: string) {
  const user = await assertAuthenticated();

  // Verify membership
  await assertSchoolMember(user.id!, schoolId);

  return db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
}

export async function updateSchoolInfo(
  schoolId: string,
  data: {
    name?: string;
    mascot?: string | null;
    address?: string | null;
    state?: string | null;
    district?: string | null;
  }
) {
  const user = await assertAuthenticated();

  // Only PTA board or admin can update school info
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: Only PTA board or admins can update school information");
  }

  // Validate name if provided
  if (data.name !== undefined && data.name.trim().length === 0) {
    throw new Error("School name cannot be empty");
  }

  const [updated] = await db
    .update(schools)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.mascot !== undefined && { mascot: data.mascot?.trim() || null }),
      ...(data.address !== undefined && { address: data.address?.trim() || null }),
      ...(data.state !== undefined && { state: data.state?.trim() || null }),
      ...(data.district !== undefined && { district: data.district?.trim() || null }),
    })
    .where(eq(schools.id, schoolId))
    .returning();

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return updated;
}

function generateRandomCode(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars: 0/O, 1/I/L
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function updateBoardPosition(
  schoolId: string,
  position: PtaBoardPosition,
  membershipId: string | null
) {
  const user = await assertAuthenticated();

  // PTA board members or admins can update board positions
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: Only PTA board or admins can update board positions");
  }

  const schoolYear = await getSchoolCurrentYear(schoolId);

  // If setting to null, clear the position from whoever has it
  if (!membershipId) {
    await db
      .update(schoolMemberships)
      .set({ boardPosition: null })
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.schoolYear, schoolYear),
          eq(schoolMemberships.boardPosition, position)
        )
      );
  } else {
    // First, clear this position from anyone who has it
    await db
      .update(schoolMemberships)
      .set({ boardPosition: null })
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.schoolYear, schoolYear),
          eq(schoolMemberships.boardPosition, position)
        )
      );

    // Also clear any position the target member currently has
    await db
      .update(schoolMemberships)
      .set({ boardPosition: null })
      .where(eq(schoolMemberships.id, membershipId));

    // Now assign the position to the specified member
    await db
      .update(schoolMemberships)
      .set({ boardPosition: position })
      .where(eq(schoolMemberships.id, membershipId));
  }

  revalidatePath("/admin/board");
  revalidatePath("/admin/members");
  return { success: true };
}

export async function regenerateSchoolCode(schoolId: string) {
  const user = await assertAuthenticated();

  // Only PTA board or admin can regenerate codes
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: Only PTA board or admins can regenerate school codes");
  }

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) throw new Error("School not found");

  // Generate fully random 8-character code
  const newCode = generateRandomCode(8);

  const [updated] = await db
    .update(schools)
    .set({ joinCode: newCode })
    .where(eq(schools.id, schoolId))
    .returning();

  revalidatePath("/admin/settings");
  revalidatePath("/admin/overview");
  return updated;
}

export async function setCustomSchoolCode(schoolId: string, customCode: string) {
  const user = await assertAuthenticated();

  // Only PTA board or admin can set custom codes
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: Only PTA board or admins can set school codes");
  }

  // Normalize and validate the custom code
  const normalizedCode = customCode.trim().toUpperCase();

  if (normalizedCode.length < 4) {
    throw new Error("Code must be at least 4 characters");
  }

  if (normalizedCode.length > 20) {
    throw new Error("Code must be 20 characters or less");
  }

  if (!/^[A-Z0-9]+$/.test(normalizedCode)) {
    throw new Error("Code can only contain letters and numbers");
  }

  // Check if code is already in use by another school
  const existingSchool = await db.query.schools.findFirst({
    where: eq(schools.joinCode, normalizedCode),
  });

  if (existingSchool && existingSchool.id !== schoolId) {
    throw new Error("This code is already in use by another school");
  }

  const [updated] = await db
    .update(schools)
    .set({ joinCode: normalizedCode })
    .where(eq(schools.id, schoolId))
    .returning();

  revalidatePath("/admin/settings");
  revalidatePath("/admin/overview");
  return updated;
}
