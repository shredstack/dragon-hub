"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  classrooms,
  committees,
  committeeSignups,
  schools,
  users,
  volunteerCampaignEvents,
  volunteerCampaigns,
  volunteerInterests,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql, type AnyColumn } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { createSignInLink } from "@/lib/magic-link";
import { sendVerificationReminderEmail } from "@/lib/email";

/**
 * A parent who signed up (room parent, party volunteer, campaign interest, or
 * committee) but has no account yet — `userId IS NULL` across the signup tables
 * means the email has never been claimed, because `linkExistingAccountToSchool`
 * stamps `userId` whenever a matching account already exists. These people are
 * invisible in the membership-based directory even though the VP needs to see
 * and reach them.
 */
export interface PendingMember {
  /** Lowercased email — the stable key that unifies the signup tables. */
  email: string;
  name: string | null;
  phone: string | null;
  /** Human labels for what they signed up for, e.g. "Room parent". */
  sources: string[];
}

const SOURCE_LABELS = {
  room_parent: "Room parent",
  party_volunteer: "Party volunteer",
  campaign: "Volunteer interest",
  committee: "Committee",
} as const;

/**
 * Every un-verified signup for the current school + school year, grouped by
 * email. PTA board / school admin only.
 */
export async function getPendingMembers(): Promise<PendingMember[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);

  // volunteer_signups has no school_year column — it inherits the year from its
  // classroom, so we scope through the classroom join.
  const classroomSignups = await db
    .select({
      name: volunteerSignups.name,
      email: volunteerSignups.email,
      phone: volunteerSignups.phone,
      role: volunteerSignups.role,
    })
    .from(volunteerSignups)
    .innerJoin(classrooms, eq(volunteerSignups.classroomId, classrooms.id))
    .where(
      and(
        eq(volunteerSignups.schoolId, schoolId),
        eq(volunteerSignups.status, "active"),
        isNull(volunteerSignups.userId),
        eq(classrooms.schoolYear, schoolYear)
      )
    );

  const campaignInterests = await db
    .select({
      name: volunteerInterests.name,
      email: volunteerInterests.email,
      phone: volunteerInterests.phone,
    })
    .from(volunteerInterests)
    .where(
      and(
        eq(volunteerInterests.schoolId, schoolId),
        eq(volunteerInterests.status, "active"),
        isNull(volunteerInterests.userId),
        eq(volunteerInterests.schoolYear, schoolYear)
      )
    );

  const committeeInterests = await db
    .select({
      name: committeeSignups.name,
      email: committeeSignups.email,
      phone: committeeSignups.phone,
    })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.schoolId, schoolId),
        inArray(committeeSignups.status, ["active", "waitlisted"]),
        isNull(committeeSignups.userId),
        eq(committeeSignups.schoolYear, schoolYear)
      )
    );

  const byEmail = new Map<string, PendingMember>();

  const add = (
    row: { name: string | null; email: string; phone: string | null },
    source: string
  ) => {
    const key = row.email.trim().toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.name = existing.name ?? row.name;
      existing.phone = existing.phone ?? row.phone;
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return;
    }
    byEmail.set(key, {
      email: key,
      name: row.name,
      phone: row.phone,
      sources: [source],
    });
  };

  for (const row of classroomSignups) {
    add(
      row,
      row.role === "room_parent"
        ? SOURCE_LABELS.room_parent
        : SOURCE_LABELS.party_volunteer
    );
  }
  for (const row of campaignInterests) add(row, SOURCE_LABELS.campaign);
  for (const row of committeeInterests) add(row, SOURCE_LABELS.committee);

  return [...byEmail.values()].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email)
  );
}

export interface MemberActivity {
  email: string;
  name: string | null;
  phone: string | null;
  /** True once they've clicked their sign-in link and verified the email. */
  verified: boolean;
  classroomSignups: {
    classroom: string;
    role: "room_parent" | "party_volunteer";
    partyTypes: string[];
  }[];
  campaigns: { campaign: string; event: string; interestLevel: string }[];
  committees: { committee: string; willingToChair: boolean; waitlisted: boolean }[];
}

/**
 * Everything a person raised their hand for, by email — works whether or not
 * they have an account. Powers the directory drill-down. PTA board / school
 * admin only, scoped to the current school + school year.
 */
export async function getMemberActivity(email: string): Promise<MemberActivity> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const normalized = email.trim().toLowerCase();
  const emailMatches = (col: AnyColumn) => sql`lower(${col}) = ${normalized}`;

  const account = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${normalized}`,
    columns: { name: true, phone: true, emailVerified: true },
  });

  const classroomSignups = await db
    .select({
      classroom: classrooms.name,
      role: volunteerSignups.role,
      partyTypes: volunteerSignups.partyTypes,
      name: volunteerSignups.name,
      phone: volunteerSignups.phone,
    })
    .from(volunteerSignups)
    .innerJoin(classrooms, eq(volunteerSignups.classroomId, classrooms.id))
    .where(
      and(
        eq(volunteerSignups.schoolId, schoolId),
        eq(volunteerSignups.status, "active"),
        eq(classrooms.schoolYear, schoolYear),
        emailMatches(volunteerSignups.email)
      )
    );

  const campaigns = await db
    .select({
      campaign: volunteerCampaigns.title,
      event: volunteerCampaignEvents.title,
      interestLevel: volunteerInterests.interestLevel,
      name: volunteerInterests.name,
      phone: volunteerInterests.phone,
    })
    .from(volunteerInterests)
    .innerJoin(
      volunteerCampaignEvents,
      eq(volunteerInterests.campaignEventId, volunteerCampaignEvents.id)
    )
    .innerJoin(
      volunteerCampaigns,
      eq(volunteerInterests.campaignId, volunteerCampaigns.id)
    )
    .where(
      and(
        eq(volunteerInterests.schoolId, schoolId),
        eq(volunteerInterests.status, "active"),
        eq(volunteerInterests.schoolYear, schoolYear),
        emailMatches(volunteerInterests.email)
      )
    );

  const committeeRows = await db
    .select({
      committee: committees.name,
      willingToChair: committeeSignups.willingToChair,
      status: committeeSignups.status,
      name: committeeSignups.name,
      phone: committeeSignups.phone,
    })
    .from(committeeSignups)
    .innerJoin(committees, eq(committeeSignups.committeeId, committees.id))
    .where(
      and(
        eq(committeeSignups.schoolId, schoolId),
        inArray(committeeSignups.status, ["active", "waitlisted"]),
        eq(committeeSignups.schoolYear, schoolYear),
        emailMatches(committeeSignups.email)
      )
    );

  // Name/phone: prefer the account, then any signup row that captured them.
  const fallbackName =
    account?.name ??
    classroomSignups[0]?.name ??
    campaigns[0]?.name ??
    committeeRows[0]?.name ??
    null;
  const fallbackPhone =
    account?.phone ??
    classroomSignups[0]?.phone ??
    campaigns[0]?.phone ??
    committeeRows[0]?.phone ??
    null;

  return {
    email: normalized,
    name: fallbackName,
    phone: fallbackPhone,
    verified: !!account?.emailVerified,
    classroomSignups: classroomSignups.map((r) => ({
      classroom: r.classroom,
      role: r.role,
      partyTypes: r.partyTypes ?? [],
    })),
    campaigns: campaigns.map((r) => ({
      campaign: r.campaign,
      event: r.event,
      interestLevel: r.interestLevel,
    })),
    committees: committeeRows.map((r) => ({
      committee: r.committee,
      willingToChair: r.willingToChair,
      waitlisted: r.status === "waitlisted",
    })),
  };
}

/**
 * Re-send a one-click sign-in link to someone who signed up but never verified.
 * Only works for an email that actually has a signup or an unverified account at
 * the current school — this is not an open email relay. PTA board / school admin
 * only.
 */
export async function resendMemberInvite(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const normalized = email.trim().toLowerCase();

  // Guard: the address must belong to a real signup (or unverified account) at
  // this school before we'll email it.
  const activity = await getMemberActivity(normalized);
  const hasSignup =
    activity.classroomSignups.length > 0 ||
    activity.campaigns.length > 0 ||
    activity.committees.length > 0;
  if (!hasSignup) {
    return {
      success: false,
      error: "No signup found for this email at your school.",
    };
  }
  if (activity.verified) {
    return {
      success: false,
      error: "This person has already verified their email.",
    };
  }

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { name: true },
  });

  const { url, expiresInHours } = await createSignInLink(normalized, {
    callbackPath: "/dashboard",
  });

  await sendVerificationReminderEmail({
    to: normalized,
    url,
    schoolName: school?.name ?? "your school",
    name: activity.name,
    expiresInHours,
  });

  return { success: true };
}
