import type { NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";

// Edge-compatible auth config for middleware
// This config does NOT include database operations or the DrizzleAdapter
// Those are added in auth.ts for server-side use only
export const authConfig: NextAuthConfig = {
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
};
