"use server";

import {
  assertAuthenticated,
  getUserSchoolMembership,
  setCurrentSchoolId,
  assertSchoolMember,
  isPtaBoardMember,
} from "@/lib/auth-helpers";
import {
  JOIN_CODE_REJECTION_MESSAGES,
  codeRequiresApproval,
  findJoinCode,
  syncPtaJoinCode,
} from "@/lib/join-codes";
import { db } from "@/lib/db";
import { schoolJoinCodes, schoolMemberships, schools } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  HIDEABLE_MODULES,
  type ModuleVisibility,
} from "@/lib/module-visibility";
import type { SchoolRole, PtaBoardPosition } from "@/types";

/**
 * Redeem a code and join the school it belongs to.
 *
 * A code no longer means one thing. The PTA code still admits a parent as a
 * plain member on the spot; a school admin code admits the principal, and the
 * SCC code will admit its council — so what someone becomes is a property of
 * the code they typed, read from `school_join_codes`.
 *
 * Anything above `member` lands in `pending` instead of `approved`. That is
 * partly because a privilege-granting code is a secret that gets forwarded in
 * staff email, and partly to preserve the guarantee in the `removed` branch
 * below: someone the board took off the roster must not be able to type a code
 * and come back with more access than they left with.
 */
export async function joinSchool(joinCode: string) {
  const user = await assertAuthenticated();

  const found = await findJoinCode(joinCode);
  if (!found.ok) {
    return { success: false, error: JOIN_CODE_REJECTION_MESSAGES[found.reason] };
  }
  const code = found.code;

  const school = await db.query.schools.findFirst({
    where: and(eq(schools.id, code.schoolId), eq(schools.active, true)),
  });

  if (!school) {
    return {
      success: false,
      error: "We couldn't find a school with that code. Please check the code and try again.",
    };
  }

  const needsApproval = codeRequiresApproval(code);
  const grantedStatus = needsApproval ? "pending" : "approved";

  /** Bump the use counter once a code has actually admitted someone. */
  const recordUse = async () => {
    await db
      .update(schoolJoinCodes)
      .set({ uses: code.uses + 1, updatedAt: new Date() })
      .where(eq(schoolJoinCodes.id, code.id));
  };

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
    if (existingMembership.status === "pending") {
      return {
        success: true,
        school,
        pending: true,
        alreadyMember: true,
      };
    } else if (existingMembership.status === "approved") {
      // Already in. A privilege-granting code is still worth honouring — this
      // is how a parent who volunteers becomes the school's new secretary —
      // but the upgrade waits for an approval like any other.
      if (needsApproval && existingMembership.role !== code.grantsRole) {
        await db
          .update(schoolMemberships)
          .set({ status: "pending", joinCodeId: code.id })
          .where(eq(schoolMemberships.id, existingMembership.id));
        await recordUse();
        await setCurrentSchoolId(school.id);
        revalidatePath("/dashboard");
        return { success: true, school, pending: true };
      }
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
          status: grantedStatus,
          approvedAt: needsApproval ? null : new Date(),
          renewedFrom: existingMembership.id,
          joinCodeId: code.id,
        })
        .where(eq(schoolMemberships.id, existingMembership.id));

      await recordUse();
      await setCurrentSchoolId(school.id);
      revalidatePath("/dashboard");
      return { success: true, school, renewed: true, pending: needsApproval };
    } else if (existingMembership.status === "removed") {
      // Taken off the roster by the board, but not barred — a valid code lets
      // them back in. They return as a plain member: whatever role or board
      // position they held before is deliberately not restored, so rejoining
      // can never hand back admin access the board just took away.
      //
      // A code that grants more than `member` doesn't get to route around that
      // either; it lands in `pending`, so someone has to say yes out loud.
      await db
        .update(schoolMemberships)
        .set({
          status: grantedStatus,
          role: needsApproval ? "member" : code.grantsRole,
          boardPosition: null,
          adminPosition: null,
          joinCodeId: code.id,
          approvedAt: needsApproval ? null : new Date(),
        })
        .where(eq(schoolMemberships.id, existingMembership.id));

      await recordUse();
      await setCurrentSchoolId(school.id);
      revalidatePath("/dashboard");
      return { success: true, school, rejoined: true, pending: needsApproval };
    }
  }

  // A code that only grants `member` is self-approving — the PTA hands it out
  // on a flyer, and making a parent wait for a board member to notice would
  // strand them on an empty dashboard on Back to School Night.
  await db.insert(schoolMemberships).values({
    schoolId: school.id,
    userId: user.id!,
    role: needsApproval ? "member" : code.grantsRole,
    schoolYear,
    status: grantedStatus,
    source: code.grantsSource,
    joinCodeId: code.id,
    approvedAt: needsApproval ? null : new Date(),
  });

  await recordUse();

  // Set the current school cookie
  await setCurrentSchoolId(school.id);

  revalidatePath("/dashboard");
  return { success: true, school, pending: needsApproval };
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

  // `removed`, not `revoked`: leaving is the member's own decision, and
  // `revoked` is the one status joinSchool refuses to let back in. Someone who
  // taps Leave by mistake should be able to rejoin with the code rather than
  // needing an administrator. The board position goes for the same reason
  // rejoining doesn't restore one — coming back is coming back as a member.
  await db
    .update(schoolMemberships)
    .set({ status: "removed", boardPosition: null })
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
  const hasAccess = await isPtaBoardMember(user.id!, schoolId);
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
  const canManage = await isPtaBoardMember(user.id!, schoolId);
  if (!canManage) {
    throw new Error("Unauthorized: Only the PTA board can change member roles");
  }

  const targetMembership = await db.query.schoolMemberships.findFirst({
    where: eq(schoolMemberships.id, membershipId),
  });

  // Being an admin of `schoolId` says nothing about a membership row belonging
  // to it — without this, a guessed id reaches another school's roster.
  if (!targetMembership || targetMembership.schoolId !== schoolId) {
    throw new Error("Member not found in this school");
  }

  // Prevent admin from changing their own role
  if (targetMembership.userId === user.id) {
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
  const hasAccess = await isPtaBoardMember(user.id!, schoolId);
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
  const hasAccess = await isPtaBoardMember(user.id!, schoolId);
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

/**
 * Turn Budget/Fundraisers on or off for general members. Leadership keeps
 * access to both regardless — see src/lib/module-visibility.ts.
 */
export async function updateModuleVisibility(
  schoolId: string,
  visibility: ModuleVisibility
) {
  const user = await assertAuthenticated();

  const hasAccess = await isPtaBoardMember(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error(
      "Unauthorized: Only PTA board or admins can change feature visibility"
    );
  }

  // Rebuild from the known keys so a caller can't stash arbitrary JSON here.
  const sanitized: ModuleVisibility = {};
  for (const key of HIDEABLE_MODULES) {
    sanitized[key] = visibility[key] !== false;
  }

  const [updated] = await db
    .update(schools)
    .set({ moduleVisibility: sanitized })
    .where(eq(schools.id, schoolId))
    .returning();

  // The nav is rendered in the app layout, so every page needs re-rendering.
  revalidatePath("/", "layout");
  return updated?.moduleVisibility ?? sanitized;
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
  const hasAccess = await isPtaBoardMember(user.id!, schoolId);
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
    // Board access to `schoolId` doesn't make an arbitrary membership id this
    // school's — check before writing a board position into it.
    const target = await db.query.schoolMemberships.findFirst({
      where: eq(schoolMemberships.id, membershipId),
      columns: { id: true, schoolId: true },
    });
    if (!target || target.schoolId !== schoolId) {
      throw new Error("Member not found in this school");
    }

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

    // Now assign the position to the specified member. Whatever position they
    // held before is simply overwritten — boardPosition is a single column, so
    // the separate "clear the target first" write this replaced was a no-op.
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
  const hasAccess = await isPtaBoardMember(user.id!, schoolId);
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

  // Redemption reads school_join_codes, not this column — keep them in step.
  await syncPtaJoinCode(schoolId, newCode);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/overview");
  return updated;
}

export async function setCustomSchoolCode(schoolId: string, customCode: string) {
  const user = await assertAuthenticated();

  // Only PTA board or admin can set custom codes
  const hasAccess = await isPtaBoardMember(user.id!, schoolId);
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

  await syncPtaJoinCode(schoolId, normalizedCode);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/overview");
  return updated;
}
