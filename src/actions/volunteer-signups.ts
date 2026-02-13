"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  schools,
  classrooms,
  volunteerSignups,
  users,
  classroomMembers,
  schoolMemberships,
} from "@/lib/db/schema";
import { eq, and, sql, not } from "drizzle-orm";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { sendVolunteerWelcomeEmail } from "@/lib/email";

// Types for volunteer settings
export interface VolunteerSettings {
  roomParentLimit: number;
  partyTypes: string[];
  enabled: boolean;
}

const DEFAULT_VOLUNTEER_SETTINGS: VolunteerSettings = {
  roomParentLimit: 2,
  partyTypes: ["halloween", "valentines"],
  enabled: true,
};

// ─── QR Code Generation ────────────────────────────────────────────────────

export async function generateVolunteerQrCode() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Generate unique code if doesn't exist
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  let qrCode = school.volunteerQrCode;
  if (!qrCode) {
    qrCode = nanoid(12);
    await db
      .update(schools)
      .set({ volunteerQrCode: qrCode })
      .where(eq(schools.id, schoolId));
  }

  revalidatePath("/admin/room-parents");
  return { qrCode };
}

export async function regenerateVolunteerQrCode() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  // Always generate a new code
  const qrCode = nanoid(12);
  await db
    .update(schools)
    .set({ volunteerQrCode: qrCode })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/room-parents");
  return { qrCode };
}

export async function getVolunteerQrCodeData() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerQrCode: true, name: true, volunteerSettings: true },
  });
  if (!school) throw new Error("School not found");

  const settings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  if (!school.volunteerQrCode) {
    return { qrCode: null, qrDataUrl: null, school, settings };
  }

  // Generate QR code data URL
  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  const signupUrl = `${baseUrl}/volunteer-signup/${school.volunteerQrCode}`;
  const qrDataUrl = await QRCode.toDataURL(signupUrl, {
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return {
    qrCode: school.volunteerQrCode,
    qrDataUrl,
    signupUrl,
    school,
    settings,
  };
}

export async function updateVolunteerSettings(settings: Partial<VolunteerSettings>) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerSettings: true },
  });
  if (!school) throw new Error("School not found");

  const currentSettings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  const updatedSettings = { ...currentSettings, ...settings };

  await db
    .update(schools)
    .set({ volunteerSettings: updatedSettings })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/room-parents");
  return { settings: updatedSettings };
}

// ─── Public Signup (QR Code) ───────────────────────────────────────────────

export async function getSignupPageData(qrCode: string) {
  const school = await db.query.schools.findFirst({
    where: eq(schools.volunteerQrCode, qrCode),
    columns: {
      id: true,
      name: true,
      volunteerSettings: true,
    },
  });

  if (!school) {
    return null;
  }

  const settings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  if (!settings.enabled) {
    return null;
  }

  // Get active classrooms grouped by grade
  const classroomList = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, school.id),
      eq(classrooms.active, true)
    ),
    orderBy: [classrooms.gradeLevel, classrooms.name],
  });

  // Get current room parent counts for each classroom
  const roomParentCounts = await db
    .select({
      classroomId: volunteerSignups.classroomId,
      count: sql<number>`count(*)::int`,
    })
    .from(volunteerSignups)
    .where(
      and(
        eq(volunteerSignups.schoolId, school.id),
        eq(volunteerSignups.role, "room_parent"),
        eq(volunteerSignups.status, "active")
      )
    )
    .groupBy(volunteerSignups.classroomId);

  const countMap = new Map(roomParentCounts.map((c) => [c.classroomId, c.count]));

  const classroomsWithCounts = classroomList.map((c) => ({
    ...c,
    roomParentCount: countMap.get(c.id) || 0,
    roomParentLimit: settings.roomParentLimit,
  }));

  return {
    school: { id: school.id, name: school.name },
    classrooms: classroomsWithCounts,
    partyTypes: settings.partyTypes,
    roomParentLimit: settings.roomParentLimit,
  };
}

export interface SignupSubmission {
  name: string;
  email: string;
  phone?: string;
  classroomSignups: Array<{
    classroomId: string;
    isRoomParent: boolean;
    partyTypes: string[];
  }>;
}

export async function submitVolunteerSignup(qrCode: string, data: SignupSubmission) {
  // Validate school and get settings
  const school = await db.query.schools.findFirst({
    where: eq(schools.volunteerQrCode, qrCode),
  });

  if (!school) {
    throw new Error("Invalid signup link");
  }

  const settings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  if (!settings.enabled) {
    throw new Error("Volunteer signup is currently disabled");
  }

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, data.email.toLowerCase()),
  });

  // Create school membership for existing user if needed
  if (existingUser) {
    const existingMembership = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, existingUser.id),
        eq(schoolMemberships.schoolId, school.id),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
      ),
    });

    if (!existingMembership) {
      await db.insert(schoolMemberships).values({
        userId: existingUser.id,
        schoolId: school.id,
        role: "member",
        schoolYear: CURRENT_SCHOOL_YEAR,
        status: "approved",
        approvedAt: new Date(),
      });
    }
  }

  // Track results
  const results: Array<{
    classroomId: string;
    classroomName: string;
    role: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const signup of data.classroomSignups) {
    const classroom = await db.query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, signup.classroomId),
        eq(classrooms.schoolId, school.id)
      ),
    });

    if (!classroom) {
      results.push({
        classroomId: signup.classroomId,
        classroomName: "Unknown",
        role: signup.isRoomParent ? "Room Parent" : "Party Volunteer",
        success: false,
        error: "Classroom not found",
      });
      continue;
    }

    // Handle room parent signup
    if (signup.isRoomParent) {
      // Check capacity with row-level lock
      const currentCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(volunteerSignups)
        .where(
          and(
            eq(volunteerSignups.classroomId, signup.classroomId),
            eq(volunteerSignups.role, "room_parent"),
            eq(volunteerSignups.status, "active")
          )
        );

      if (currentCount[0].count >= settings.roomParentLimit) {
        results.push({
          classroomId: signup.classroomId,
          classroomName: classroom.name,
          role: "Room Parent",
          success: false,
          error: `Room parent spots are full (${settings.roomParentLimit}/${settings.roomParentLimit})`,
        });
        continue;
      }

      // Check for existing signup
      const existing = await db.query.volunteerSignups.findFirst({
        where: and(
          eq(volunteerSignups.classroomId, signup.classroomId),
          eq(volunteerSignups.email, data.email.toLowerCase()),
          eq(volunteerSignups.role, "room_parent"),
          eq(volunteerSignups.status, "active")
        ),
      });

      if (existing) {
        results.push({
          classroomId: signup.classroomId,
          classroomName: classroom.name,
          role: "Room Parent",
          success: true,
          error: "Already signed up",
        });
      } else {
        await db.insert(volunteerSignups).values({
          schoolId: school.id,
          classroomId: signup.classroomId,
          userId: existingUser?.id || null,
          name: data.name,
          email: data.email.toLowerCase(),
          phone: data.phone || null,
          role: "room_parent",
          partyTypes: signup.partyTypes.length > 0 ? signup.partyTypes : null,
          signupSource: "qr_code",
        });

        // Create classroom membership for existing user
        if (existingUser) {
          const existingMember = await db.query.classroomMembers.findFirst({
            where: and(
              eq(classroomMembers.userId, existingUser.id),
              eq(classroomMembers.classroomId, signup.classroomId)
            ),
          });

          if (!existingMember) {
            await db.insert(classroomMembers).values({
              userId: existingUser.id,
              classroomId: signup.classroomId,
              role: "room_parent",
            });
          } else if (existingMember.role === "volunteer") {
            // Upgrade from volunteer to room_parent
            await db
              .update(classroomMembers)
              .set({ role: "room_parent" })
              .where(eq(classroomMembers.id, existingMember.id));
          }
        }

        results.push({
          classroomId: signup.classroomId,
          classroomName: classroom.name,
          role: "Room Parent",
          success: true,
        });
      }
    }

    // Handle party volunteer signup
    if (!signup.isRoomParent && signup.partyTypes.length > 0) {
      const existing = await db.query.volunteerSignups.findFirst({
        where: and(
          eq(volunteerSignups.classroomId, signup.classroomId),
          eq(volunteerSignups.email, data.email.toLowerCase()),
          eq(volunteerSignups.role, "party_volunteer"),
          eq(volunteerSignups.status, "active")
        ),
      });

      if (existing) {
        // Update party types
        await db
          .update(volunteerSignups)
          .set({ partyTypes: signup.partyTypes })
          .where(eq(volunteerSignups.id, existing.id));

        results.push({
          classroomId: signup.classroomId,
          classroomName: classroom.name,
          role: "Party Volunteer",
          success: true,
          error: "Updated existing signup",
        });
      } else {
        await db.insert(volunteerSignups).values({
          schoolId: school.id,
          classroomId: signup.classroomId,
          userId: existingUser?.id || null,
          name: data.name,
          email: data.email.toLowerCase(),
          phone: data.phone || null,
          role: "party_volunteer",
          partyTypes: signup.partyTypes,
          signupSource: "qr_code",
        });

        // Create classroom membership for existing user
        if (existingUser) {
          const existingMember = await db.query.classroomMembers.findFirst({
            where: and(
              eq(classroomMembers.userId, existingUser.id),
              eq(classroomMembers.classroomId, signup.classroomId)
            ),
          });

          if (!existingMember) {
            await db.insert(classroomMembers).values({
              userId: existingUser.id,
              classroomId: signup.classroomId,
              role: "volunteer",
            });
          }
          // Don't downgrade room_parent to volunteer
        }

        results.push({
          classroomId: signup.classroomId,
          classroomName: classroom.name,
          role: "Party Volunteer",
          success: true,
        });
      }
    }
  }

  // Send welcome email if there were successful signups
  const successfulResults = results.filter((r) => r.success);
  if (successfulResults.length > 0) {
    const classroomNames = successfulResults.map((r) => r.classroomName);
    const roles = [...new Set(successfulResults.map((r) => r.role))];
    const baseUrl =
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const signInUrl = `${baseUrl}/sign-in`;

    try {
      await sendVolunteerWelcomeEmail({
        to: data.email,
        name: data.name,
        schoolName: school.name,
        classroomNames,
        roles,
        signInUrl,
      });
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      // Don't fail the signup if email fails
    }
  }

  return {
    success: results.some((r) => r.success),
    results,
    existingAccount: !!existingUser,
  };
}

// ─── Manual Volunteer Addition (VP Dashboard) ──────────────────────────────

export interface ManualVolunteerData {
  name: string;
  email: string;
  phone?: string;
  classroomSignups: Array<{
    classroomId: string;
    role: "room_parent" | "party_volunteer";
    partyTypes?: string[];
  }>;
  notes?: string;
}

export async function addVolunteerManually(data: ManualVolunteerData) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  const settings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  // Check if user already exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, data.email.toLowerCase()),
  });

  const results: Array<{
    classroomId: string;
    role: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const signup of data.classroomSignups) {
    // Verify classroom belongs to school
    const classroom = await db.query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, signup.classroomId),
        eq(classrooms.schoolId, schoolId)
      ),
    });

    if (!classroom) {
      results.push({
        classroomId: signup.classroomId,
        role: signup.role,
        success: false,
        error: "Classroom not found",
      });
      continue;
    }

    // Check for existing signup
    const existing = await db.query.volunteerSignups.findFirst({
      where: and(
        eq(volunteerSignups.classroomId, signup.classroomId),
        eq(volunteerSignups.email, data.email.toLowerCase()),
        eq(volunteerSignups.role, signup.role),
        eq(volunteerSignups.status, "active")
      ),
    });

    if (existing) {
      results.push({
        classroomId: signup.classroomId,
        role: signup.role,
        success: false,
        error: "Already signed up for this role",
      });
      continue;
    }

    // For room parents, check capacity but allow override (VP can exceed limit)
    if (signup.role === "room_parent") {
      const currentCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(volunteerSignups)
        .where(
          and(
            eq(volunteerSignups.classroomId, signup.classroomId),
            eq(volunteerSignups.role, "room_parent"),
            eq(volunteerSignups.status, "active")
          )
        );

      if (currentCount[0].count >= settings.roomParentLimit) {
        // Allow but note that it exceeds limit
      }
    }

    await db.insert(volunteerSignups).values({
      schoolId,
      classroomId: signup.classroomId,
      userId: existingUser?.id || null,
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      role: signup.role,
      partyTypes: signup.partyTypes || null,
      signupSource: "manual",
      notes: data.notes || null,
      createdBy: user.id!,
    });

    results.push({
      classroomId: signup.classroomId,
      role: signup.role,
      success: true,
    });
  }

  revalidatePath("/admin/room-parents");
  return { success: results.some((r) => r.success), results };
}

// ─── Edit/Remove Volunteers ────────────────────────────────────────────────

export async function updateVolunteerSignup(
  signupId: string,
  data: { name?: string; email?: string; phone?: string; notes?: string }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const signup = await db.query.volunteerSignups.findFirst({
    where: and(
      eq(volunteerSignups.id, signupId),
      eq(volunteerSignups.schoolId, schoolId)
    ),
  });

  if (!signup) throw new Error("Signup not found");

  await db
    .update(volunteerSignups)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email.toLowerCase() }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
    })
    .where(eq(volunteerSignups.id, signupId));

  revalidatePath("/admin/room-parents");
}

export async function removeVolunteerSignup(signupId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const signup = await db.query.volunteerSignups.findFirst({
    where: and(
      eq(volunteerSignups.id, signupId),
      eq(volunteerSignups.schoolId, schoolId)
    ),
  });

  if (!signup) throw new Error("Signup not found");

  // Soft delete
  await db
    .update(volunteerSignups)
    .set({
      status: "removed",
      removedAt: new Date(),
      removedBy: user.id!,
    })
    .where(eq(volunteerSignups.id, signupId));

  // Remove classroom membership if user is linked and has no other active signups
  if (signup.userId) {
    // Check if user has other active signups for this classroom
    const otherActiveSignups = await db.query.volunteerSignups.findFirst({
      where: and(
        eq(volunteerSignups.userId, signup.userId),
        eq(volunteerSignups.classroomId, signup.classroomId),
        eq(volunteerSignups.status, "active"),
        not(eq(volunteerSignups.id, signupId))
      ),
    });

    if (!otherActiveSignups) {
      // Remove from classroom_members
      await db
        .delete(classroomMembers)
        .where(
          and(
            eq(classroomMembers.userId, signup.userId),
            eq(classroomMembers.classroomId, signup.classroomId)
          )
        );
    }
  }

  revalidatePath("/admin/room-parents");
}

// ─── Dashboard Queries ─────────────────────────────────────────────────────

export async function getVolunteerDashboardData() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerSettings: true, name: true },
  });
  if (!school) throw new Error("School not found");

  const settings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  // Get all classrooms
  const classroomList = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, schoolId),
      eq(classrooms.active, true)
    ),
    orderBy: [classrooms.gradeLevel, classrooms.name],
  });

  // Get all active volunteer signups
  const signups = await db.query.volunteerSignups.findMany({
    where: and(
      eq(volunteerSignups.schoolId, schoolId),
      eq(volunteerSignups.status, "active")
    ),
  });

  // Build classroom summary
  const classroomSummaries = classroomList.map((classroom) => {
    const classroomSignups = signups.filter(
      (s) => s.classroomId === classroom.id
    );
    const roomParents = classroomSignups.filter((s) => s.role === "room_parent");
    const partyVolunteers = classroomSignups.filter(
      (s) => s.role === "party_volunteer"
    );

    // Count by party type
    const partyVolunteerCounts: Record<string, number> = {};
    for (const type of settings.partyTypes) {
      partyVolunteerCounts[type] = partyVolunteers.filter(
        (v) => v.partyTypes?.includes(type)
      ).length;
    }

    return {
      classroom,
      roomParents,
      partyVolunteers,
      roomParentCount: roomParents.length,
      roomParentLimit: settings.roomParentLimit,
      partyVolunteerCounts,
    };
  });

  return {
    school: { name: school.name },
    settings,
    classrooms: classroomSummaries,
    totalRoomParents: signups.filter((s) => s.role === "room_parent").length,
    totalPartyVolunteers: signups.filter((s) => s.role === "party_volunteer")
      .length,
  };
}

export async function getClassroomVolunteers(classroomId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify classroom belongs to school
  const classroom = await db.query.classrooms.findFirst({
    where: and(
      eq(classrooms.id, classroomId),
      eq(classrooms.schoolId, schoolId)
    ),
  });
  if (!classroom) throw new Error("Classroom not found");

  const signups = await db.query.volunteerSignups.findMany({
    where: and(
      eq(volunteerSignups.classroomId, classroomId),
      eq(volunteerSignups.status, "active")
    ),
    orderBy: [volunteerSignups.role, volunteerSignups.name],
  });

  return {
    classroom,
    roomParents: signups.filter((s) => s.role === "room_parent"),
    partyVolunteers: signups.filter((s) => s.role === "party_volunteer"),
  };
}

// ─── Export Volunteers ─────────────────────────────────────────────────────

export async function exportVolunteers(filters?: {
  gradeLevel?: string;
  role?: "room_parent" | "party_volunteer";
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const signups = await db.query.volunteerSignups.findMany({
    where: and(
      eq(volunteerSignups.schoolId, schoolId),
      eq(volunteerSignups.status, "active"),
      filters?.role ? eq(volunteerSignups.role, filters.role) : undefined
    ),
    with: {
      classroom: true,
    },
  });

  // Filter by grade level if specified
  const filteredSignups = filters?.gradeLevel
    ? signups.filter((s) => s.classroom?.gradeLevel === filters.gradeLevel)
    : signups;

  // Format for CSV
  const csvData = filteredSignups.map((s) => ({
    Name: s.name,
    Email: s.email,
    Phone: s.phone || "",
    Classroom: s.classroom?.name || "",
    "Grade Level": s.classroom?.gradeLevel || "",
    Role: s.role === "room_parent" ? "Room Parent" : "Party Volunteer",
    "Party Types": s.partyTypes?.join(", ") || "",
    "Signup Source": s.signupSource === "qr_code" ? "QR Code" : "Manual",
    "Signed Up": s.createdAt?.toLocaleDateString() || "",
  }));

  return csvData;
}

// ─── Check Room Parent Access ──────────────────────────────────────────────

export async function isUserRoomParentForClassroom(
  userId: string,
  classroomId: string
): Promise<boolean> {
  // Check classroom_members role
  const member = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      eq(classroomMembers.classroomId, classroomId),
      eq(classroomMembers.role, "room_parent")
    ),
  });
  if (member) return true;

  // Check volunteer_signups
  const signup = await db.query.volunteerSignups.findFirst({
    where: and(
      eq(volunteerSignups.userId, userId),
      eq(volunteerSignups.classroomId, classroomId),
      eq(volunteerSignups.role, "room_parent"),
      eq(volunteerSignups.status, "active")
    ),
  });

  return !!signup;
}

export async function isUserTeacherForClassroom(
  userId: string,
  classroomId: string
): Promise<boolean> {
  const member = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      eq(classroomMembers.classroomId, classroomId),
      eq(classroomMembers.role, "teacher")
    ),
  });
  return !!member;
}

export async function isUserRoomParentVP(userId: string, schoolId: string): Promise<boolean> {
  const membership = await getSchoolMembership(userId, schoolId);
  return membership?.boardPosition === "room_parent_vp";
}
