/**
 * Plumbing shared by every public volunteer signup flow — the classroom-scoped
 * room parent signup and the general PTA volunteer interest campaigns.
 *
 * These flows differ entirely in what they collect but are identical in what
 * they do with a parent afterwards: validate the contact fields, attach them to
 * the school for the current year if they already have an account, and email a
 * one-click sign-in link. Keeping that here means a fix to (say) phone
 * normalization or the welcome email lands in both places at once.
 *
 * Deliberately not a "use server" module: these are internal helpers, not
 * server actions, and `normalizeContact` is synchronous.
 */

import { db } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { sendVolunteerWelcomeEmail } from "@/lib/email";
import { createSignInLink, getAppBaseUrl } from "@/lib/magic-link";
import { isValidEmail, isValidPhoneNumber, normalizePhoneNumber } from "@/lib/utils";

// ─── Contact Validation ────────────────────────────────────────────────────

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
}

export interface NormalizedContact {
  name: string;
  email: string;
  /** Digits only, matching how phone numbers are stored on `users`. */
  phone: string | null;
}

export type ContactValidation =
  | { ok: true; contact: NormalizedContact }
  | { ok: false; error: string };

/**
 * Validates and normalizes the contact fields shared by every signup path.
 * The forms validate the same rules client-side; this is the backstop for
 * direct action calls and stale clients.
 */
export function normalizeContact(data: ContactInput): ContactValidation {
  const name = data.name.trim();
  if (!name) {
    return { ok: false, error: "Please enter your name." };
  }

  const email = data.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return {
      ok: false,
      error: "Please enter a valid email address (for example, jane@example.com).",
    };
  }

  const phoneInput = data.phone?.trim() ?? "";
  if (phoneInput && !isValidPhoneNumber(phoneInput)) {
    return {
      ok: false,
      error: "Please enter a valid 10-digit phone number (for example, (555) 123-4567).",
    };
  }

  return { ok: true, contact: { name, email, phone: normalizePhoneNumber(phoneInput) } };
}

// ─── Account Linking ───────────────────────────────────────────────────────

/**
 * Looks up an existing account by email and, if found, makes sure it's attached
 * to this school for this year. Returns null when the email is new — those
 * parents get an account the first time they click the welcome email's link.
 */
export async function linkExistingAccountToSchool(
  email: string,
  schoolId: string,
  schoolYear: string
) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!existingUser) return null;

  const existingMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, existingUser.id),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear)
    ),
  });

  if (!existingMembership) {
    await db.insert(schoolMemberships).values({
      userId: existingUser.id,
      schoolId,
      role: "member",
      schoolYear,
      status: "approved",
      approvedAt: new Date(),
    });
  }

  return existingUser;
}

// ─── Welcome Email ─────────────────────────────────────────────────────────

/**
 * Sends the welcome email with a one-click sign-in link so a new volunteer
 * lands in the hub straight from this email instead of having to request a
 * separate magic link. Falls back to the sign-in page if the link can't be
 * minted (e.g. missing AUTH_SECRET).
 */
export async function sendWelcomeEmail(params: {
  email: string;
  name: string;
  schoolName: string;
  signups: Array<{ classroomName?: string; role: string }>;
  listIntro?: string;
  benefits?: string[];
  /** Where the sign-in link drops them. Defaults to the dashboard. */
  callbackPath?: string;
}) {
  const baseUrl = getAppBaseUrl();
  const fallbackSignInUrl = `${baseUrl}/sign-in`;

  let signInUrl = fallbackSignInUrl;
  let directSignIn = false;
  let expiresInHours: number | undefined;

  try {
    const link = await createSignInLink(params.email, {
      callbackPath: params.callbackPath ?? "/dashboard",
    });
    signInUrl = link.url;
    directSignIn = true;
    expiresInHours = link.expiresInHours;
  } catch (error) {
    console.error("Failed to create one-click sign-in link:", error);
  }

  await sendVolunteerWelcomeEmail({
    to: params.email,
    name: params.name,
    schoolName: params.schoolName,
    signups: params.signups,
    listIntro: params.listIntro,
    benefits: params.benefits,
    signInUrl,
    directSignIn,
    expiresInHours,
    fallbackSignInUrl,
  });
}
