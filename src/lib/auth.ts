import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import type { GoogleProfile } from "next-auth/providers/google";
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
import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import { eq, and, desc, or, isNull } from "drizzle-orm";

// App-specific cookie prefix to avoid conflicts when running multiple apps
// on the same domain (e.g., *.shredstack.net or localhost)
const COOKIE_PREFIX = "dragonhub";

// Look up the user's school by email for personalized magic link emails
async function getSchoolNameForEmail(email: string): Promise<string | null> {
  // First check volunteer signups (most common case for new users). Waitlisted
  // counts — they put their hand up, and the email they're about to get should
  // still say which school it's from.
  const volunteerSignup = await db.query.volunteerSignups.findFirst({
    where: and(
      eq(volunteerSignups.email, email.toLowerCase()),
      or(
        eq(volunteerSignups.status, "active"),
        eq(volunteerSignups.status, "waitlisted")
      )
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
    // Google is registered only when credentials exist — see
    // `isGoogleAuthConfigured`. The sign-in page hides the button on the same
    // condition.
    ...(isGoogleAuthConfigured()
      ? [
          Google({
            // The magic link is the older door, so nearly every account that
            // will ever click "Sign in with Google" already exists as a
            // `users` row with no `accounts` row. Without this flag Auth.js
            // refuses to attach the Google identity to that row and throws
            // OAuthAccountNotLinked — every existing family would hit an error
            // screen on their first try.
            //
            // The flag is "dangerous" in general because a provider that
            // doesn't verify email ownership would let anyone claim an account
            // by asserting its address. Google does verify, and the `signIn`
            // callback below rejects any Google profile that says otherwise,
            // which is the condition that makes linking safe here.
            allowDangerousEmailAccountLinking: true,
            profile(profile: GoogleProfile) {
              return {
                id: profile.sub,
                name: profile.name,
                // Account linking is an exact-match lookup on `users.email`.
                // The magic link path stores addresses lowercased (Auth.js
                // normalizes the identifier), so a Google profile that came
                // back with different casing would miss the existing row and
                // create the duplicate account this whole flow exists to
                // prevent. Normalize to the same shape before the lookup.
                email: profile.email.toLowerCase(),
                image: profile.picture,
                // NB: `emailVerified` cannot be set from here — Auth.js calls
                // `createUser({ ...profile, emailVerified: null })`, so the
                // null wins. It's stamped in the `linkAccount` event instead.
              };
            },
          }),
        ]
      : []),
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
    // Fires exactly when an OAuth identity is attached to a user row — both
    // when Google created that row and when it linked onto one that a magic
    // link made earlier.
    async linkAccount({ user, account }) {
      // Auth.js hard-codes `emailVerified: null` when creating a user from an
      // OAuth profile, so a Google-first account would sit in the PTA
      // directory showing an "unverified" badge (and export as Verified: No)
      // despite Google having verified the address — the `signIn` callback
      // refuses the sign-in otherwise. Stamp it once, here.
      // The `isNull` guard is in the statement rather than a read-then-write
      // so an existing magic-link user keeps their original verification date.
      if (account.provider === "google" && user.id) {
        await db
          .update(users)
          .set({ emailVerified: new Date() })
          .where(and(eq(users.id, user.id), isNull(users.emailVerified)));
      }
    },
    // Careful: despite the name, Auth.js fires this on the OAuth *linking*
    // path too — an existing magic-link user signing in with Google for the
    // first time reaches here without any user having been created. Everything
    // below is safe to re-run (it already runs on every sign-in via the
    // `signIn` event), but don't add anything here that isn't.
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
    async signIn({ account, profile }) {
      // The guard that earns `allowDangerousEmailAccountLinking` above. An
      // unverified Google profile is an unproven claim to an address, and
      // linking on it would hand over whatever school membership, board role
      // and classroom access that address already holds.
      if (account?.provider === "google") {
        const verified = (profile as GoogleProfile | undefined)?.email_verified;
        if (!verified) {
          console.warn(
            `Refused Google sign-in for unverified address ${profile?.email ?? "(none)"}`
          );
          return false;
        }
      }
      return true;
    },
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
