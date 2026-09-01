import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
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
  superAdmins,
} from "@/lib/db/schema";
import { linkVolunteerSignupsToUser } from "@/lib/volunteer-linking";
import { linkCommitteeSignupsToUser } from "@/lib/committee-onboarding";
import { linkEventPlanInvitesToUser } from "@/lib/event-plan-invites";
import { linkTeacherClassroomsToUser } from "@/lib/teacher-linking";
import { sendMagicLinkEmail } from "@/lib/email";
import {
  isAppleAuthConfigured,
  isDemoLoginConfigured,
  isGoogleAuthConfigured,
} from "@/lib/auth-providers";
import { appleClientSecret } from "@/lib/apple-client-secret";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { createHash, timingSafeEqual } from "crypto";

// App-specific cookie prefix to avoid conflicts when running multiple apps
// on the same domain (e.g., *.shredstack.net or localhost)
const COOKIE_PREFIX = "dragonhub";

/** The subset of Apple's ID token claims this app reads. */
interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  /**
   * Apple sends this as the STRING "true"/"false", not a boolean. A truthiness
   * check therefore passes for `"false"` — see the `signIn` callback, which
   * compares explicitly for exactly this reason.
   */
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
}

/** The one-time name payload in Apple's first form-post. */
interface AppleUserPayload {
  name?: { firstName?: string; lastName?: string };
  email?: string;
}

/**
 * Compare without leaking length or content through timing.
 *
 * `timingSafeEqual` throws on unequal lengths, and padding to compare would
 * leak the length anyway, so both sides go through a fixed-width hash first —
 * the same shape `cron-auth.ts` uses.
 */
/**
 * Options for the three OAuth checking cookies, made survivable across Apple's
 * cross-site form-post. See the `cookies` block below for why.
 *
 * These are short-lived, single-use, httpOnly values that exist only between
 * the redirect out and the callback back, so `SameSite=None` on them is not
 * the CSRF exposure it would be on the session cookie — which deliberately
 * stays `Lax`.
 */
function appleCompatibleCookie() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // `None` requires `Secure`; over plain-HTTP localhost the browser drops
    // the cookie entirely, which would break Google sign-in in dev to fix
    // Apple sign-in in prod.
    sameSite: isProd ? ("none" as const) : ("lax" as const),
    path: "/",
    secure: isProd,
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}

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
    // This runs before anyone has signed in — it only needs the school's name
    // for the magic-link email, and it is the one unauthenticated path that
    // touches a signup row at all.
    columns: { students: false },
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
    columns: { students: false },
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

export const { handlers, auth, signIn, signOut } = NextAuth(async () => ({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Resend({
      from: process.env.EMAIL_FROM || "DragonHub <dragonhub@shredstack.net>",
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
    // Sign in with Apple. Required under Guideline 4.8 once the app offers a
    // third-party login (Google), and registered on the same all-or-nothing
    // condition — see `isAppleAuthConfigured`.
    ...(isAppleAuthConfigured()
      ? [
          Apple({
            // The Services ID, not the bundle ID.
            clientId: process.env.AUTH_APPLE_ID!,
            // A JWT this app signs at runtime and re-mints hourly. Apple's
            // secrets expire (6 months max), and a pasted one fails months
            // later with `invalid_client`. See `apple-client-secret.ts`.
            clientSecret: await appleClientSecret(),
            // Same rationale as Google: nearly every account that will click
            // this button already exists as a magic-link `users` row with no
            // `accounts` row, and without this Auth.js throws
            // OAuthAccountNotLinked on their first try. The `signIn` callback
            // below is what earns it — it refuses an unverified address.
            allowDangerousEmailAccountLinking: true,
            profile(profile: AppleIdTokenClaims, tokens) {
              // Apple sends the user's name EXACTLY ONCE, on the very first
              // authorization, in the form-post body rather than in the ID
              // token — and never again. If it isn't captured here, the parent
              // shows up in every roster as a bare email address forever.
              const raw = (tokens as { user?: unknown } | undefined)?.user;
              const parsed =
                typeof raw === "string"
                  ? (JSON.parse(raw) as AppleUserPayload)
                  : (raw as AppleUserPayload | undefined);
              const name = parsed?.name
                ? [parsed.name.firstName, parsed.name.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim()
                : null;

              return {
                id: profile.sub,
                name: name || profile.email || null,
                // Normalized for the same reason as Google: account linking is
                // an exact-match lookup on `users.email`, and the magic-link
                // path stores addresses lowercased.
                email: profile.email?.toLowerCase(),
              };
            },
          }),
        ]
      : []),
    // The App Store / Play reviewer's door. Registered only when both demo
    // variables exist — see `isDemoLoginConfigured`.
    ...(isDemoLoginConfigured()
      ? [
          Credentials({
            id: "demo",
            name: "Demo",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
              const email = String(credentials?.email ?? "")
                .trim()
                .toLowerCase();
              const password = String(credentials?.password ?? "");

              // Rate-limited before anything else. This provider is public by
              // construction — its password is written in an App Store Connect
              // review-notes field — so it must not also be an unmetered
              // password oracle.
              const { checkRateLimit, RATE_LIMITS, getClientIp } = await import(
                "@/lib/rate-limit"
              );
              const limit = await checkRateLimit(
                RATE_LIMITS.demoLoginPerIp,
                `ip:${await getClientIp()}`
              );
              if (!limit.ok) {
                console.warn("Demo login rate limit exceeded");
                return null;
              }

              const expectedEmail = process.env.DEMO_LOGIN_EMAIL!.toLowerCase();
              const expectedPassword = process.env.DEMO_LOGIN_PASSWORD!;

              if (email !== expectedEmail) return null;
              if (!constantTimeEquals(password, expectedPassword)) return null;

              // Resolve the seeded account. Looked up by DEMO_LOGIN_EMAIL only
              // — the credentials never select which user to become.
              const demoUser = await db.query.users.findFirst({
                where: eq(users.email, expectedEmail),
                columns: { id: true, name: true, email: true, image: true },
              });
              if (!demoUser) {
                console.error(
                  `DEMO_LOGIN_EMAIL is set to ${expectedEmail} but no such user exists — run scripts/seed-demo-school.ts`
                );
                return null;
              }

              // The guard that matters. A misconfigured demo account handing a
              // reviewer platform-wide super admin — every school's data, every
              // family's contact details — is the one way this goes badly
              // wrong, and it would be invisible until it had happened.
              const isSuper = await db.query.superAdmins.findFirst({
                where: eq(superAdmins.userId, demoUser.id),
                columns: { id: true },
              });
              if (isSuper) {
                console.error(
                  `Refusing demo sign-in: ${expectedEmail} holds super_admin. The demo account must be an ordinary pta_board member of the demo school.`
                );
                return null;
              }

              return {
                id: demoUser.id,
                name: demoUser.name,
                email: demoUser.email,
                image: demoUser.image,
              };
            },
          }),
        ]
      : []),
  ],
  // Already `jwt`, and that is what makes the Credentials provider above work
  // at all — a database session strategy silently ignores Credentials sign-ins
  // because there is no adapter callback to create the session row. Don't
  // "fix" this to `database`.
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
    // ── The three cookies Sign in with Apple breaks ───────────────────────
    //
    // Apple replies with `response_mode=form_post`: a cross-site POST from
    // appleid.apple.com back to our callback. `SameSite=Lax` cookies are NOT
    // sent on a cross-site POST, so the state / PKCE / nonce cookies simply
    // aren't there when Auth.js looks for them, and it throws `InvalidCheck`.
    //
    // Auth.js has its own accommodation for this — but it only applies when
    // you leave the `cookies` block alone, and this app overrides it wholesale
    // for the `dragonhub.` prefix. So the accommodation has to be restated
    // here, explicitly, or Apple sign-in fails 100% of the time.
    //
    // `sameSite: "none"` REQUIRES `secure: true`, which means **Apple sign-in
    // cannot be tested over plain-HTTP localhost** — use a tunnel or a preview
    // deployment. In development these fall back to Lax/insecure so the other
    // providers keep working locally.
    state: {
      name: `${COOKIE_PREFIX}.state`,
      options: appleCompatibleCookie(),
    },
    pkceCodeVerifier: {
      name: `${COOKIE_PREFIX}.pkce.code_verifier`,
      options: appleCompatibleCookie(),
    },
    nonce: {
      name: `${COOKIE_PREFIX}.nonce`,
      options: appleCompatibleCookie(),
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

        // And the classroom the board named this address as the teacher of, so
        // a teacher signing in for the first time lands in their own room
        // rather than on an empty Classrooms page.
        try {
          const result = await linkTeacherClassroomsToUser(user.id, user.email);
          if (result.linked > 0) {
            console.log(`Linked ${result.linked} classroom(s) to teacher ${user.id}`);
          }
        } catch (error) {
          console.error("Failed to link teacher classrooms:", error);
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

        // Re-run every sign-in, not just the first: the board may have named
        // this address as a teacher long after the account existed, and a new
        // school year makes a fresh classroom row that needs its own link.
        try {
          await linkTeacherClassroomsToUser(user.id, user.email);
        } catch (error) {
          console.error("Failed to link teacher classrooms on sign-in:", error);
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

      // The same guard for Apple, and it needs its own comparison rather than
      // sharing Google's.
      //
      // Apple sends `email_verified` as the STRING "true" — so the truthiness
      // check above passes for the string "false" just as happily. A guard that
      // accepts exactly what it means to reject is worse than no guard, because
      // it reads as though the case is handled.
      if (account?.provider === "apple") {
        const claims = profile as AppleIdTokenClaims | undefined;
        const verified =
          claims?.email_verified === true || claims?.email_verified === "true";
        if (!verified) {
          console.warn(
            `Refused Apple sign-in for unverified address ${profile?.email ?? "(none)"}`
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
}));
