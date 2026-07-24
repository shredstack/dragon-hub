"use server";

import {
  assertAuthenticated,
  assertSchoolAdminRole,
  assertSchoolLeadership,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  schoolAdminPositions,
  schoolJoinCodes,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  getSchoolAdminPositions,
  getSchoolAdminPositionsWithSeed,
  getSchoolAdminPositionLabels,
} from "@/lib/school-admin-positions";
import {
  assertCodeAvailable,
  createJoinCode,
  generateRandomCode,
  getSchoolAdminJoinCodes,
  normalizeJoinCode,
} from "@/lib/join-codes";
import {
  slugifyAdminPositionLabel,
  type SchoolAdminPosition,
} from "@/lib/school-admin-positions-shared";

/** Resolve the caller's school and confirm they run its administration. */
async function assertSchoolAdminContext() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolAdminRole(user.id!, schoolId);
  return { userId: user.id!, schoolId };
}

function revalidateSchoolAdmin() {
  revalidatePath("/admin/school");
  revalidatePath("/admin/school/positions");
  revalidatePath("/admin/school/codes");
  revalidatePath("/admin/school/directory");
}

// ─── Positions ──────────────────────────────────────────────────────────────

export interface SchoolAdminPositionWithUsage extends SchoolAdminPosition {
  /** Staff currently assigned. Drives the roster hint and blocks deletion. */
  memberCount: number;
  inUse: boolean;
}

export async function listSchoolAdminPositions(): Promise<
  SchoolAdminPositionWithUsage[]
> {
  const { schoolId } = await assertSchoolAdminContext();
  const positions = await getSchoolAdminPositionsWithSeed(schoolId, {
    includeInactive: true,
  });

  const counts = await db
    .select({
      slug: schoolMemberships.adminPosition,
      count: sql<number>`count(*)::int`,
    })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        ne(schoolMemberships.status, "removed")
      )
    )
    .groupBy(schoolMemberships.adminPosition);

  const bySlug = new Map(counts.map((c) => [c.slug, c.count]));

  return positions.map((p) => {
    const memberCount = bySlug.get(p.slug) ?? 0;
    return { ...p, memberCount, inUse: memberCount > 0 };
  });
}

export async function reorderSchoolAdminPositions(orderedIds: string[]) {
  const { schoolId } = await assertSchoolAdminContext();

  const owned = await getSchoolAdminPositions(schoolId, {
    includeInactive: true,
  });
  const ownedIds = new Set(owned.map((p) => p.id));
  if (orderedIds.some((id) => !ownedIds.has(id))) {
    throw new Error("Position not found");
  }

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(schoolAdminPositions)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(schoolAdminPositions.id, id))
    )
  );

  revalidateSchoolAdmin();
}

export async function createSchoolAdminPosition(input: {
  label: string;
  description?: string;
}) {
  const { schoolId } = await assertSchoolAdminContext();

  const label = input.label.trim();
  if (!label) throw new Error("A position needs a name");
  if (label.length > 80) throw new Error("Name must be 80 characters or less");

  const base = slugifyAdminPositionLabel(label);
  if (!base) throw new Error("That name can't be turned into an identifier");

  // A school that already retired "Counselor" and now adds it back would
  // collide with the retired row, so walk to the first free suffix rather than
  // failing on the unique index.
  const existing = await getSchoolAdminPositions(schoolId, {
    includeInactive: true,
  });
  const taken = new Set(existing.map((p) => p.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}_${n++}`;

  const nextOrder =
    existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;

  const [row] = await db
    .insert(schoolAdminPositions)
    .values({
      schoolId,
      slug,
      label,
      description: input.description?.trim() || null,
      sortOrder: nextOrder,
      isStandard: false,
    })
    .returning();

  revalidateSchoolAdmin();
  return row;
}

export async function updateSchoolAdminPosition(
  positionId: string,
  input: { label?: string; description?: string | null; sortOrder?: number }
) {
  const { schoolId } = await assertSchoolAdminContext();

  const position = await db.query.schoolAdminPositions.findFirst({
    where: eq(schoolAdminPositions.id, positionId),
  });
  if (!position || position.schoolId !== schoolId) {
    throw new Error("Position not found");
  }

  const label = input.label?.trim();
  if (label !== undefined && !label) throw new Error("A position needs a name");

  // The slug deliberately does not follow the label. Memberships store the
  // slug, so renaming "Office Secretary" to "Front Office Lead" has to keep
  // pointing at the same people.
  await db
    .update(schoolAdminPositions)
    .set({
      ...(label ? { label } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schoolAdminPositions.id, positionId));

  revalidateSchoolAdmin();
}

/**
 * Retire or restore a position.
 *
 * Retiring rather than deleting: a membership filed under this slug still has
 * to render with a real name, and "stop offering this" is what someone reaching
 * for Delete almost always means. `deleteSchoolAdminPosition` is there for the
 * case they really do mean it, and refuses while anyone still holds it.
 */
export async function setSchoolAdminPositionActive(
  positionId: string,
  active: boolean
) {
  const { schoolId } = await assertSchoolAdminContext();

  const position = await db.query.schoolAdminPositions.findFirst({
    where: eq(schoolAdminPositions.id, positionId),
  });
  if (!position || position.schoolId !== schoolId) {
    throw new Error("Position not found");
  }

  await db
    .update(schoolAdminPositions)
    .set({ active, updatedAt: new Date() })
    .where(eq(schoolAdminPositions.id, positionId));

  revalidateSchoolAdmin();
}

export async function deleteSchoolAdminPosition(positionId: string) {
  const { schoolId } = await assertSchoolAdminContext();

  const position = await db.query.schoolAdminPositions.findFirst({
    where: eq(schoolAdminPositions.id, positionId),
  });
  if (!position || position.schoolId !== schoolId) {
    throw new Error("Position not found");
  }

  const [{ holders }] = await db
    .select({ holders: sql<number>`count(*)::int` })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.adminPosition, position.slug)
      )
    );

  if (holders > 0) {
    throw new Error(
      `${holders} ${holders === 1 ? "person is" : "people are"} still assigned to ${position.label}. Reassign them, or retire the position instead.`
    );
  }

  await db
    .delete(schoolAdminPositions)
    .where(eq(schoolAdminPositions.id, positionId));

  revalidateSchoolAdmin();
}

/** Assign or clear a staff member's position. */
export async function setMemberAdminPosition(
  membershipId: string,
  slug: string | null
) {
  const { schoolId } = await assertSchoolAdminContext();

  const membership = await db.query.schoolMemberships.findFirst({
    where: eq(schoolMemberships.id, membershipId),
  });
  if (!membership || membership.schoolId !== schoolId) {
    throw new Error("Member not found");
  }
  if (membership.role !== "admin") {
    throw new Error("Only school administrators hold a school admin position");
  }

  if (slug) {
    const position = await db.query.schoolAdminPositions.findFirst({
      where: and(
        eq(schoolAdminPositions.schoolId, schoolId),
        eq(schoolAdminPositions.slug, slug)
      ),
      columns: { id: true },
    });
    if (!position) throw new Error("Position not found");
  }

  await db
    .update(schoolMemberships)
    .set({ adminPosition: slug })
    .where(eq(schoolMemberships.id, membershipId));

  revalidateSchoolAdmin();
}

// ─── Staff access codes ─────────────────────────────────────────────────────

export async function listStaffJoinCodes() {
  const { schoolId } = await assertSchoolAdminContext();
  return getSchoolAdminJoinCodes(schoolId);
}

/**
 * Mint a code that admits school administrators.
 *
 * It always requires approval, whatever the caller asks for — see
 * `codeRequiresApproval`. This code grants sight of every classroom and
 * committee message board in the school, and it will be pasted into a staff
 * email and forwarded from there.
 */
export async function createStaffJoinCode(input: {
  label: string;
  code?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
}) {
  const { schoolId, userId } = await assertSchoolAdminContext();

  const label = input.label.trim() || "Staff access code";
  const code = input.code
    ? normalizeJoinCode(input.code)
    : generateRandomCode(8);

  await assertCodeAvailable(code);

  const row = await createJoinCode({
    schoolId,
    code,
    label,
    grantsRole: "admin",
    grantsSource: "school_admin_code",
    requiresApproval: true,
    maxUses: input.maxUses ?? null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    createdBy: userId,
  });

  revalidateSchoolAdmin();
  return row;
}

export async function setStaffJoinCodeActive(codeId: string, active: boolean) {
  const { schoolId } = await assertSchoolAdminContext();

  const code = await db.query.schoolJoinCodes.findFirst({
    where: eq(schoolJoinCodes.id, codeId),
  });
  if (!code || code.schoolId !== schoolId) throw new Error("Code not found");
  if (code.grantsSource === "pta_join_code") {
    throw new Error("The PTA join code is managed from the PTA Board Hub");
  }

  await db
    .update(schoolJoinCodes)
    .set({ active, updatedAt: new Date() })
    .where(eq(schoolJoinCodes.id, codeId));

  revalidateSchoolAdmin();
}

export async function deleteStaffJoinCode(codeId: string) {
  const { schoolId } = await assertSchoolAdminContext();

  const code = await db.query.schoolJoinCodes.findFirst({
    where: eq(schoolJoinCodes.id, codeId),
  });
  if (!code || code.schoolId !== schoolId) throw new Error("Code not found");
  if (code.grantsSource === "pta_join_code") {
    throw new Error("The PTA join code is managed from the PTA Board Hub");
  }

  // Memberships keep their provenance: join_code_id is ON DELETE SET NULL, and
  // `source` on the membership still records that they came in as staff.
  await db.delete(schoolJoinCodes).where(eq(schoolJoinCodes.id, codeId));

  revalidateSchoolAdmin();
}

// ─── Approvals ──────────────────────────────────────────────────────────────

export interface PendingStaffMember {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  codeLabel: string | null;
  requestedAt: Date | null;
}

export async function listPendingStaff(): Promise<PendingStaffMember[]> {
  const { schoolId } = await assertSchoolAdminContext();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const rows = await db
    .select({
      membershipId: schoolMemberships.id,
      userId: schoolMemberships.userId,
      name: users.name,
      email: users.email,
      codeLabel: schoolJoinCodes.label,
      requestedAt: schoolMemberships.createdAt,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .leftJoin(
      schoolJoinCodes,
      eq(schoolJoinCodes.id, schoolMemberships.joinCodeId)
    )
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "pending")
      )
    )
    .orderBy(desc(schoolMemberships.createdAt));

  return rows.map((r) => ({ ...r, email: r.email ?? "" }));
}

export async function getPendingStaffCount(): Promise<number> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return 0;
  // Called from the hub page for a badge; a non-admin simply sees nothing
  // rather than an error page.
  try {
    await assertSchoolAdminRole(user.id!, schoolId);
  } catch {
    return 0;
  }

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "pending")
      )
    );
  return count;
}

/**
 * Let a pending staff member in, at the role their code was minted to grant.
 *
 * The role comes from the code rather than from the request, so that a pending
 * row can't be edited into something it was never approved for.
 */
export async function approvePendingStaff(membershipId: string) {
  const { schoolId } = await assertSchoolAdminContext();

  const membership = await db.query.schoolMemberships.findFirst({
    where: eq(schoolMemberships.id, membershipId),
    with: { joinCode: true },
  });
  if (!membership || membership.schoolId !== schoolId) {
    throw new Error("Member not found");
  }
  if (membership.status !== "pending") {
    throw new Error("That request has already been handled");
  }

  const grantedRole = membership.joinCode?.grantsRole ?? "admin";
  const grantedSource = membership.joinCode?.grantsSource ?? "school_admin_code";

  await db
    .update(schoolMemberships)
    .set({
      status: "approved",
      role: grantedRole,
      source: grantedSource,
      approvedAt: new Date(),
    })
    .where(eq(schoolMemberships.id, membershipId));

  revalidateSchoolAdmin();
}

export async function denyPendingStaff(membershipId: string) {
  const { schoolId } = await assertSchoolAdminContext();

  const membership = await db.query.schoolMemberships.findFirst({
    where: eq(schoolMemberships.id, membershipId),
  });
  if (!membership || membership.schoolId !== schoolId) {
    throw new Error("Member not found");
  }
  if (membership.status !== "pending") {
    throw new Error("That request has already been handled");
  }

  // `removed`, not `revoked`: they typed a code they weren't meant to have, and
  // that shouldn't bar them from joining later as an ordinary parent.
  await db
    .update(schoolMemberships)
    .set({ status: "removed", role: "member", adminPosition: null })
    .where(eq(schoolMemberships.id, membershipId));

  revalidateSchoolAdmin();
}

// ─── Directory ──────────────────────────────────────────────────────────────

export interface SchoolDirectoryMember {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  positionLabel: string | null;
  source: string;
  joinedAt: Date | null;
}

/**
 * Everyone who has joined DragonHub at this school.
 *
 * Read-only on purpose. The school admin's directory answers "who is here?";
 * managing who may stay is the board's job, and lives in their hub. This is
 * also the wider of the two lists — the PTA's directory shows only people who
 * came in through a PTA door.
 */
export async function listSchoolDirectory(): Promise<SchoolDirectoryMember[]> {
  const { schoolId } = await assertSchoolAdminContext();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const [rows, adminLabels, boardLabelsRow] = await Promise.all([
    db
      .select({
        membershipId: schoolMemberships.id,
        userId: schoolMemberships.userId,
        name: users.name,
        email: users.email,
        role: schoolMemberships.role,
        boardPosition: schoolMemberships.boardPosition,
        adminPosition: schoolMemberships.adminPosition,
        source: schoolMemberships.source,
        joinedAt: schoolMemberships.approvedAt,
      })
      .from(schoolMemberships)
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.schoolYear, schoolYear),
          eq(schoolMemberships.status, "approved")
        )
      )
      .orderBy(asc(users.name)),
    getSchoolAdminPositionLabels(schoolId),
    import("@/lib/board-positions").then((m) =>
      m.getBoardPositionLabels(schoolId)
    ),
  ]);

  return rows.map((r) => ({
    membershipId: r.membershipId,
    userId: r.userId,
    name: r.name,
    email: r.email ?? "",
    role: r.role,
    positionLabel:
      (r.adminPosition ? adminLabels[r.adminPosition] : null) ??
      (r.boardPosition ? boardLabelsRow[r.boardPosition] : null) ??
      null,
    source: r.source,
    joinedAt: r.joinedAt,
  }));
}

/**
 * The school's own administrators, for the roster card on the PTA Board Hub.
 *
 * The board doesn't manage these accounts, but it should never discover one by
 * accident: a school admin can create positions and mint codes, so the list of
 * who holds that access stays visible to the PTA.
 *
 * Takes `schoolId` as a parameter rather than deriving it, because the board
 * hub already has it — which means this file's `"use server"` makes it a
 * callable endpoint with an attacker-supplied school. It checks leadership at
 * *that* school itself; the caller's own check doesn't travel with the request.
 */
export async function listSchoolStaff(schoolId: string) {
  const user = await assertAuthenticated();
  await assertSchoolLeadership(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const adminLabels = await getSchoolAdminPositionLabels(schoolId);

  const rows = await db
    .select({
      name: users.name,
      email: users.email,
      adminPosition: schoolMemberships.adminPosition,
      status: schoolMemberships.status,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.role, "admin"),
        ne(schoolMemberships.status, "removed")
      )
    )
    .orderBy(asc(users.name));

  return rows.map((r) => ({
    name: r.name,
    email: r.email ?? "",
    positionLabel: r.adminPosition ? adminLabels[r.adminPosition] ?? null : null,
    pending: r.status === "pending",
  }));
}
