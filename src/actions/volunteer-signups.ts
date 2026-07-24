"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
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
} from "@/lib/db/schema";
import { eq, and, sql, not, or, isNull } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { getAppBaseUrl } from "@/lib/magic-link";
import {
  deactivateVolunteerSignup,
  linkExistingAccountToSchool,
  normalizeContact,
  recordVolunteerSignup,
  sendWelcomeEmail,
} from "@/lib/volunteer-onboarding";
import {
  recordCampaignInterest,
  type InterestSelection,
} from "@/actions/volunteer-campaigns";
import { committees } from "@/lib/db/schema";
import { recordCommitteeSignup } from "@/lib/committee-onboarding";
import {
  formatPhoneNumber,
  isValidEmail,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/utils";
import {
  isSafeEligibilityUrl,
  normalizeEligibilityUrl,
  resolveVolunteerEligibility,
  withVolunteerEligibilityDefaults,
  type VolunteerEligibilityInfo,
} from "@/lib/volunteer-eligibility";
import {
  withSignupPageDefaults,
  type SignupPageContent,
} from "@/lib/signup-page-content";
import {
  resolveSignupPageContent,
  sanitizeSignupPageContent,
} from "@/lib/signup-page-content.server";

// Types for volunteer settings
export interface VolunteerSettings {
  roomParentLimit: number;
  partyTypes: string[];
  enabled: boolean;
  /** Board-editable copy for the public sign-up page. */
  signupPage?: SignupPageContent;
  /** District volunteer-application reminder shown after every sign-up. */
  eligibility?: VolunteerEligibilityInfo;
}

const DEFAULT_VOLUNTEER_SETTINGS: VolunteerSettings = {
  roomParentLimit: 2,
  partyTypes: ["halloween", "valentines"],
  enabled: true,
};

// Contact validation, account linking, and the welcome email are shared with
// volunteer interest campaigns — see src/lib/volunteer-onboarding.ts.

/**
 * Classrooms parents may sign up for. The PTA Board is stored as a classroom so
 * it can reuse message boards and rosters, but it isn't something a parent
 * volunteers for. Rows predating the column can be NULL, so treat NULL as
 * eligible rather than relying on the default alone.
 */
const isSignupEligible = or(
  eq(classrooms.excludeFromSignup, false),
  isNull(classrooms.excludeFromSignup)
);

// ─── QR Code Generation ────────────────────────────────────────────────────

export async function generateVolunteerQrCode() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

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
  await assertPtaBoardMember(user.id!, schoolId);

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
  await assertPtaBoardMember(user.id!, schoolId);

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
  const baseUrl = getAppBaseUrl();
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
  await assertPtaBoardMember(user.id!, schoolId);

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

// ─── Sign-up Page Content ──────────────────────────────────────────────────

/**
 * The editable copy for the public sign-up page, as stored (tokens intact) so
 * the editor shows `{{school}}` rather than a school name baked into the text.
 */
export async function getSignupPageContent(): Promise<{
  content: SignupPageContent;
  schoolName: string;
  qrCode: string | null;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { name: true, volunteerSettings: true, volunteerQrCode: true },
  });
  if (!school) throw new Error("School not found");

  return {
    content: withSignupPageDefaults(school.volunteerSettings?.signupPage),
    schoolName: school.name,
    qrCode: school.volunteerQrCode,
  };
}

export async function updateSignupPageContent(input: Partial<SignupPageContent>) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerSettings: true, volunteerQrCode: true },
  });
  if (!school) throw new Error("School not found");

  const currentSettings: VolunteerSettings =
    school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  // Sanitize on the server, not just in the editor: this HTML ends up in
  // dangerouslySetInnerHTML on a page anyone with the QR code can load.
  const signupPage = sanitizeSignupPageContent({
    ...withSignupPageDefaults(currentSettings.signupPage),
    ...input,
  });

  await db
    .update(schools)
    .set({ volunteerSettings: { ...currentSettings, signupPage } })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/room-parents/signup-page");
  if (school.volunteerQrCode) {
    revalidatePath(`/volunteer-signup/${school.volunteerQrCode}`);
  }

  return { content: signupPage };
}

// ─── District Volunteer Eligibility ────────────────────────────────────────

/**
 * The district volunteer-application reminder as stored, defaults filled in, so
 * the editor always has wording to show even before it's been configured.
 */
export async function getVolunteerEligibility(): Promise<{
  eligibility: VolunteerEligibilityInfo;
}> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerSettings: true },
  });
  if (!school) throw new Error("School not found");

  return {
    eligibility: withVolunteerEligibilityDefaults(
      school.volunteerSettings?.eligibility
    ),
  };
}

export async function updateVolunteerEligibility(
  input: Partial<VolunteerEligibilityInfo>
): Promise<
  | { success: true; eligibility: VolunteerEligibilityInfo }
  | { success: false; error: string }
> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerSettings: true, volunteerQrCode: true },
  });
  if (!school) throw new Error("School not found");

  const currentSettings: VolunteerSettings =
    school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  const merged = withVolunteerEligibilityDefaults({
    ...currentSettings.eligibility,
    ...input,
  });
  const eligibility: VolunteerEligibilityInfo = {
    ...merged,
    url: normalizeEligibilityUrl(merged.url),
    linkLabel: merged.linkLabel.trim(),
    note: merged.note.trim(),
    deadline: merged.deadline.trim(),
  };

  // An unusable URL would render a renewal notice with nowhere to go, so it's
  // rejected here rather than silently dropped at display time.
  if (eligibility.url && !isSafeEligibilityUrl(eligibility.url)) {
    return {
      success: false,
      error: "Enter a valid web address, e.g. https://district.org/volunteer",
    };
  }
  if (eligibility.url && !eligibility.linkLabel) {
    return { success: false, error: "Add link text so parents know what to click." };
  }

  await db
    .update(schools)
    .set({ volunteerSettings: { ...currentSettings, eligibility } })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/room-parents/eligibility");
  if (school.volunteerQrCode) {
    revalidatePath(`/volunteer-signup/${school.volunteerQrCode}`);
  }

  return { success: true, eligibility };
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

  // Only this year's rooms. Classrooms are per-school-year rows, so without
  // this filter a QR code keeps offering last year's classrooms alongside the
  // current ones forever.
  const schoolYear = await getSchoolCurrentYear(school.id);

  // Internal groups that borrow the classroom plumbing (the PTA Board) are
  // never offered to parents.
  const classroomList = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, school.id),
      eq(classrooms.schoolYear, schoolYear),
      eq(classrooms.active, true),
      isSignupEligible
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
    content: resolveSignupPageContent(settings.signupPage, school.name),
    eligibility: resolveVolunteerEligibility(settings.eligibility),
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
    /**
     * Per-classroom committees (Meet the Masters) checked under THIS classroom.
     * Additive and optional, so an older client behaves exactly as today.
     */
    committeeIds?: string[];
  }>;
  /**
   * Optional general-PTA event interest, present when a volunteer campaign has
   * opted into riding along on this page. Lets one Back to School Night scan
   * capture both classroom roles and school-wide event interest.
   */
  campaign?: {
    campaignId: string;
    selections: InterestSelection[];
  };
  /**
   * Committees checked on the add-on section. Optional and additive, so an
   * older client that doesn't send it behaves exactly as it does today.
   */
  committees?: Array<{ committeeId: string; willingToChair?: boolean }>;
}

interface SignupResultRow {
  classroomId: string;
  classroomName: string;
  role: string;
  success: boolean;
  error?: string;
}

export interface SignupResponse {
  success: boolean;
  results: SignupResultRow[];
  existingAccount: boolean;
  /** Event names recorded from the campaign add-on, for the confirmation screen. */
  interestedEvents: string[];
  /** Committee names actually joined, for the confirmation screen. */
  joinedCommittees: string[];
  /** Committees where the volunteer landed on the waitlist, with position. */
  waitlistedCommittees: Array<{ name: string; position: number }>;
  /** Full with no waitlist — the only committee outcome that's a dead end. */
  fullCommittees: string[];
  /** Set when the submission was rejected outright (e.g. invalid contact info). */
  error?: string;
}

export async function submitVolunteerSignup(
  qrCode: string,
  data: SignupSubmission
): Promise<SignupResponse> {
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

  const validation = normalizeContact(data);
  if (!validation.ok) {
    return {
      success: false,
      results: [],
      existingAccount: false,
      interestedEvents: [],
      joinedCommittees: [],
      waitlistedCommittees: [],
      fullCommittees: [],
      error: validation.error,
    };
  }
  const contact = validation.contact;

  const schoolYear = await getSchoolCurrentYear(school.id);

  // Attach an existing account to this school/year; new emails get an account
  // when they click the welcome email's sign-in link.
  const existingUser = await linkExistingAccountToSchool(
    contact.email,
    school.id,
    schoolYear
  );

  // Track results
  const results: Array<{
    classroomId: string;
    classroomName: string;
    role: string;
    success: boolean;
    error?: string;
  }> = [];

  // Committee outcomes accumulate across both the per-classroom rows (processed
  // inside the loop below) and the flat checklist (after it), then feed one
  // combined confirmation screen and one welcome email.
  const joinedCommittees: string[] = [];
  const waitlistedCommittees: Array<{ name: string; position: number }> = [];
  const fullCommittees: string[] = [];

  // Per-classroom committees (Meet the Masters) offered under each classroom
  // card. Resolve the eligible set once, server-side, applying every filter the
  // page applied — a stale tab or hand-crafted POST must not join an arbitrary
  // committee, least of all another school's.
  const perClassroomById = new Map<
    string,
    { id: string; name: string }
  >();
  if (
    data.classroomSignups.some((s) => s.committeeIds && s.committeeIds.length > 0)
  ) {
    const eligible = await db.query.committees.findMany({
      where: and(
        eq(committees.schoolId, school.id),
        eq(committees.schoolYear, schoolYear),
        eq(committees.status, "active"),
        eq(committees.scope, "all_classrooms"),
        eq(committees.showPerClassroomOnSignup, true),
        isNull(committees.archivedAt)
      ),
    });
    const now = new Date();
    for (const c of eligible) {
      if (
        (!c.opensAt || c.opensAt <= now) &&
        (!c.closesAt || c.closesAt >= now)
      ) {
        perClassroomById.set(c.id, c);
      }
    }
  }

  for (const signup of data.classroomSignups) {
    // Same filters the page applied — a stale tab or a hand-crafted post must
    // not be able to sign someone up for last year's or an archived room.
    const classroom = await db.query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, signup.classroomId),
        eq(classrooms.schoolId, school.id),
        eq(classrooms.schoolYear, schoolYear),
        eq(classrooms.active, true),
        isSignupEligible
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

      const { outcome } = await recordVolunteerSignup({
        schoolId: school.id,
        classroomId: signup.classroomId,
        contact,
        role: "room_parent",
        partyTypes: signup.partyTypes,
        signupSource: "qr_code",
        userId: existingUser?.id ?? null,
      });

      results.push({
        classroomId: signup.classroomId,
        classroomName: classroom.name,
        role: "Room Parent",
        success: true,
        ...(outcome === "already_active" && { error: "Already signed up" }),
      });
    }

    // Handle party volunteer signup
    if (!signup.isRoomParent && signup.partyTypes.length > 0) {
      const { outcome } = await recordVolunteerSignup({
        schoolId: school.id,
        classroomId: signup.classroomId,
        contact,
        role: "party_volunteer",
        partyTypes: signup.partyTypes,
        signupSource: "qr_code",
        userId: existingUser?.id ?? null,
      });

      results.push({
        classroomId: signup.classroomId,
        classroomName: classroom.name,
        role: "Party Volunteer",
        success: true,
        ...((outcome === "updated" || outcome === "already_active") && {
          error: "Updated existing signup",
        }),
      });
    }

    // Handle per-classroom committees (MTM) checked under this classroom. Each
    // is tagged with the classroom so capacity counts per room. Wrap per
    // committee and keep going — the room parent signup is the priority and must
    // never be lost over an add-on.
    if (signup.committeeIds && signup.committeeIds.length > 0) {
      for (const committeeId of signup.committeeIds) {
        const committee = perClassroomById.get(committeeId);
        if (!committee) continue;

        try {
          const outcome = await recordCommitteeSignup({
            schoolId: school.id,
            committeeId: committee.id,
            contact,
            classroomId: signup.classroomId,
            schoolYear,
            signupSource: "qr_code",
            userId: existingUser?.id ?? null,
          });

          const label = `${committee.name} (${classroom.name})`;
          if (outcome.outcome === "waitlisted") {
            waitlistedCommittees.push({
              name: label,
              position: outcome.waitlistPosition ?? 1,
            });
          } else if (outcome.outcome === "full") {
            fullCommittees.push(label);
          } else if (outcome.outcome !== "closed") {
            joinedCommittees.push(label);
          }
        } catch (error) {
          console.error("Failed to record per-classroom committee signup:", error);
        }
      }
    }
  }

  // Record general-PTA event interest from the campaign add-on, if any. This
  // suppresses the campaign's own welcome email so the parent gets one message
  // covering everything they just signed up for.
  let interestedEvents: string[] = [];
  if (data.campaign && data.campaign.selections.length > 0) {
    try {
      const interestResult = await recordCampaignInterest(
        data.campaign.campaignId,
        {
          name: contact.name,
          email: contact.email,
          phone: contact.phone ?? undefined,
          selections: data.campaign.selections,
        },
        { skipWelcomeEmail: true }
      );
      interestedEvents = interestResult.savedEventTitles;
    } catch (error) {
      console.error("Failed to record campaign interest:", error);
      // Room parent signup is the priority — never lose it over the add-on.
    }
  }

  // Record committee joins from the flat school-wide checklist (Yearbook). Same
  // split as the campaign block above: `recordCommitteeSignup` never emails, so
  // this parent gets one message covering everything rather than one per
  // committee. Outcomes append to the same arrays the per-classroom rows filled.
  if (data.committees && data.committees.length > 0) {
    // Re-apply every filter the page applied, server-side: correct school,
    // current year, active, opted into this page, inside its window. A stale
    // tab or a hand-crafted POST must not be able to join an arbitrary
    // committee — least of all another school's.
    const eligible = await db.query.committees.findMany({
      where: and(
        eq(committees.schoolId, school.id),
        eq(committees.schoolYear, schoolYear),
        eq(committees.status, "active"),
        eq(committees.showOnRoomParentSignup, true),
        isNull(committees.archivedAt)
      ),
    });
    const now = new Date();
    const byId = new Map(
      eligible
        .filter(
          (c) =>
            (!c.opensAt || c.opensAt <= now) && (!c.closesAt || c.closesAt >= now)
        )
        .map((c) => [c.id, c])
    );

    for (const selection of data.committees) {
      const committee = byId.get(selection.committeeId);
      if (!committee) continue;

      try {
        const outcome = await recordCommitteeSignup({
          schoolId: school.id,
          committeeId: committee.id,
          contact,
          willingToChair: selection.willingToChair ?? false,
          schoolYear,
          signupSource: "qr_code",
          userId: existingUser?.id ?? null,
        });

        if (outcome.outcome === "waitlisted") {
          waitlistedCommittees.push({
            name: committee.name,
            position: outcome.waitlistPosition ?? 1,
          });
        } else if (outcome.outcome === "full") {
          fullCommittees.push(committee.name);
        } else if (outcome.outcome !== "closed") {
          joinedCommittees.push(committee.name);
        }
      } catch (error) {
        console.error("Failed to record committee signup:", error);
        // Room parent signup is the priority — never lose it over the add-on.
      }
    }
  }

  // Send welcome email if there were successful signups
  const successfulResults = results.filter((r) => r.success);
  const emailItems = [
    ...successfulResults.map((r) => ({
      classroomName: r.classroomName,
      role: r.role,
    })),
    ...interestedEvents.map((title) => ({
      role: `Interested in helping with ${title}`,
    })),
    ...joinedCommittees.map((name) => ({ role: `${name} member` })),
    ...waitlistedCommittees.map((c) => ({
      role: `${c.name} — waitlist #${c.position}`,
    })),
  ];
  if (emailItems.length > 0) {
    try {
      await sendWelcomeEmail({
        email: contact.email,
        name: contact.name,
        schoolId: school.id,
        schoolName: school.name,
        signups: emailItems,
      });
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      // Don't fail the signup if email fails
    }
  }

  return {
    success:
      results.some((r) => r.success) ||
      interestedEvents.length > 0 ||
      joinedCommittees.length > 0 ||
      // A waitlist placement is a normal outcome, not a failure — the parent
      // put their hand up and we recorded it.
      waitlistedCommittees.length > 0,
    results,
    existingAccount: !!existingUser,
    interestedEvents,
    joinedCommittees,
    waitlistedCommittees,
    fullCommittees,
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

export interface ManualAddResponse {
  success: boolean;
  results: SignupResultRow[];
  /** Set when the submission was rejected outright (e.g. invalid contact info). */
  error?: string;
}

export async function addVolunteerManually(
  data: ManualVolunteerData
): Promise<ManualAddResponse> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  const settings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  const validation = normalizeContact(data);
  if (!validation.ok) {
    return { success: false, results: [], error: validation.error };
  }
  const contact = validation.contact;

  // Attach an existing account to this school/year so the volunteer gets
  // classroom access now, rather than waiting on their next sign-in.
  const schoolYear = await getSchoolCurrentYear(schoolId);
  const existingUser = await linkExistingAccountToSchool(
    contact.email,
    schoolId,
    schoolYear
  );

  const results: Array<{
    classroomId: string;
    classroomName: string;
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
        classroomName: "Unknown",
        role: signup.role,
        success: false,
        error: "Classroom not found",
      });
      continue;
    }

    // Room parent capacity is deliberately not enforced here: the VP adding
    // someone by hand is the override.
    const { outcome } = await recordVolunteerSignup({
      schoolId,
      classroomId: signup.classroomId,
      contact,
      role: signup.role,
      partyTypes: signup.partyTypes,
      signupSource: "manual",
      notes: data.notes,
      createdBy: user.id!,
      userId: existingUser?.id ?? null,
    });

    if (outcome === "already_active") {
      results.push({
        classroomId: signup.classroomId,
        classroomName: classroom.name,
        role: signup.role,
        success: false,
        error: "Already signed up for this role",
      });
      continue;
    }

    results.push({
      classroomId: signup.classroomId,
      classroomName: classroom.name,
      role: signup.role === "room_parent" ? "Room Parent" : "Party Volunteer",
      success: true,
    });
  }

  // Send welcome email if there were successful signups
  const successfulResults = results.filter((r) => r.success);
  if (successfulResults.length > 0) {
    const signups = successfulResults.map((r) => ({
      classroomName: r.classroomName,
      role: r.role,
    }));
    try {
      await sendWelcomeEmail({
        email: contact.email,
        name: contact.name,
        schoolId: school.id,
        schoolName: school.name,
        signups,
      });
    } catch (error) {
      console.error("Failed to send welcome email:", error);
      // Don't fail the signup if email fails
    }
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
  await assertPtaBoardMember(user.id!, schoolId);

  const signup = await db.query.volunteerSignups.findFirst({
    where: and(
      eq(volunteerSignups.id, signupId),
      eq(volunteerSignups.schoolId, schoolId)
    ),
  });

  if (!signup) throw new Error("Signup not found");

  if (data.email !== undefined && !isValidEmail(data.email)) {
    throw new Error("Please enter a valid email address.");
  }
  if (data.phone !== undefined && data.phone.trim() && !isValidPhoneNumber(data.phone)) {
    throw new Error("Please enter a valid 10-digit phone number.");
  }

  await db
    .update(volunteerSignups)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
      ...(data.phone !== undefined && { phone: normalizePhoneNumber(data.phone) }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
    })
    .where(eq(volunteerSignups.id, signupId));

  revalidatePath("/admin/room-parents");
}

export async function removeVolunteerSignup(signupId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const signup = await db.query.volunteerSignups.findFirst({
    where: and(
      eq(volunteerSignups.id, signupId),
      eq(volunteerSignups.schoolId, schoolId)
    ),
  });

  if (!signup) throw new Error("Signup not found");

  await deactivateVolunteerSignup(signup, user.id!);

  revalidatePath("/admin/room-parents");
  revalidatePath(`/classrooms/${signup.classroomId}`);
}

// ─── Dashboard Queries ─────────────────────────────────────────────────────

export async function getVolunteerDashboardData() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { volunteerSettings: true, name: true },
  });
  if (!school) throw new Error("School not found");

  const settings: VolunteerSettings = school.volunteerSettings ?? DEFAULT_VOLUNTEER_SETTINGS;

  // This year's rooms only — coverage for a year that ended isn't actionable,
  // and archived rooms and hidden groups (the PTA Board) would otherwise show
  // up as classrooms with no room parents.
  const schoolYear = await getSchoolCurrentYear(schoolId);
  const classroomList = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, schoolId),
      eq(classrooms.schoolYear, schoolYear),
      eq(classrooms.active, true),
      isSignupEligible
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
  await assertPtaBoardMember(user.id!, schoolId);

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
  await assertPtaBoardMember(user.id!, schoolId);

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
    Phone: formatPhoneNumber(s.phone),
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
