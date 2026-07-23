import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
  volunteerSignups,
  committeeSignups,
  schoolMemberships,
} from "@/lib/db/schema";
import { linkVolunteerSignupsToUser } from "@/lib/volunteer-linking";
import { linkCommitteeSignupsToUser } from "@/lib/committee-onboarding";
import { linkEventPlanInvitesToUser } from "@/lib/event-plan-invites";
import { sendMagicLinkEmail } from "@/lib/email";
import { eq, and, desc, or } from "drizzle-orm";

// App-specific cookie prefix to avoid conflicts when running multiple apps
// on the same domain (e.g., *.shredstack.net or localhost)
const COOKIE_PREFIX = "dragonhub";

// Look up the user's school by email for personalized magic link emails
async function getSchoolNameForEmail(email: string): Promise<string | null> {
  // First check volunteer signups (most common case for new users)
  const volunteerSignup = await db.query.volunteerSignups.findFirst({
    where: and(
      eq(volunteerSignups.email, email.toLowerCase()),
      eq(volunteerSignups.status, "active")
    ),
    with: { school: true },
    orderBy: [desc(volunteerSignups.createdAt)],
  });

  if (volunteerSignup?.school?.name) {
    return volunteerSignup.school.name;
  }

  // A parent who only joined a committee has no volunteer_signups row, and
  // would otherwise get an unbranded magic link from a school they've never
  // heard of. Waitlisted counts — they put their hand up.
  const committeeSignup = await db.query.committeeSignups.findFirst({
    where: and(
      eq(committeeSignups.email, email.toLowerCase()),
      or(
        eq(committeeSignups.status, "active"),
        eq(committeeSignups.status, "waitlisted")
      )
    ),
    with: { school: true },
    orderBy: [desc(committeeSignups.createdAt)],
  });

  if (committeeSignup?.school?.name) {
    return committeeSignup.school.name;
  }

  // Check school memberships for existing users
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (user) {
    const membership = await db.query.schoolMemberships.findFirst({
      where: eq(schoolMemberships.userId, user.id),
      with: { school: true },
      orderBy: [desc(schoolMemberships.createdAt)],
    });

    if (membership?.school?.name) {
      return membership.school.name;
    }
  }

  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Resend({
      from: process.env.EMAIL_FROM || "Dragon Hub <dragonhub@shredstack.net>",
      async sendVerificationRequest({ identifier: email, url }) {
        const schoolName = await getSchoolNameForEmail(email);
        await sendMagicLinkEmail({ to: email, url, schoolName });
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/verify-request",
    error: "/error",
  },
  cookies: {
    sessionToken: {
      name: `${COOKIE_PREFIX}.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: `${COOKIE_PREFIX}.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: `${COOKIE_PREFIX}.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  events: {
    async createUser({ user }) {
      // Link any pending volunteer signups to this new user
      if (user.id && user.email) {
        try {
          const result = await linkVolunteerSignupsToUser(user.id, user.email);
          if (result.linked > 0) {
            console.log(`Linked ${result.linked} volunteer signup(s) to new user ${user.id}`);
          }
        } catch (error) {
          console.error("Failed to link volunteer signups:", error);
          // Don't throw - we don't want to block user creation
        }

        // Same idea for event plan invitations: someone invited to help with
        // an event should land inside it, whether they arrived by the emailed
        // link or signed up on their own first.
        try {
          const result = await linkEventPlanInvitesToUser(user.id, user.email);
          if (result.linked > 0) {
            console.log(`Accepted ${result.linked} event plan invite(s) for new user ${user.id}`);
          }
        } catch (error) {
          console.error("Failed to link event plan invites:", error);
        }

        // And the same for committees: a parent who scanned the Yearbook QR at
        // Back to School Night should land on that committee's message board,
        // not on an empty dashboard.
        try {
          const result = await linkCommitteeSignupsToUser(user.id, user.email);
          if (result.linked > 0) {
            console.log(`Linked ${result.linked} committee signup(s) to new user ${user.id}`);
          }
        } catch (error) {
          console.error("Failed to link committee signups:", error);
        }
      }
    },
    async signIn({ user, isNewUser }) {
      // Also check on sign-in for edge cases (existing user with unlinked signups)
      if (user.id && user.email && !isNewUser) {
        try {
          await linkVolunteerSignupsToUser(user.id, user.email);
        } catch (error) {
          console.error("Failed to link volunteer signups on sign-in:", error);
        }

        try {
          await linkEventPlanInvitesToUser(user.id, user.email);
        } catch (error) {
          console.error("Failed to link event plan invites on sign-in:", error);
        }

        try {
          await linkCommitteeSignupsToUser(user.id, user.email);
        } catch (error) {
          console.error("Failed to link committee signups on sign-in:", error);
        }
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
