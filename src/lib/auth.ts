import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { linkVolunteerSignupsToUser } from "@/actions/volunteer-signups";

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
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/verify-request",
    error: "/error",
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
