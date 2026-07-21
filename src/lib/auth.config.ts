import type { NextAuthConfig } from "next-auth";

// App-specific cookie prefix to avoid conflicts when running multiple apps
// on the same domain (e.g., *.shredstack.net or localhost)
const COOKIE_PREFIX = "dragonhub";

// Edge-compatible auth config for middleware
// This config does NOT include database operations or the DrizzleAdapter
// Those are added in auth.ts for server-side use only
//
// Providers are intentionally empty: middleware only decodes the JWT session
// cookie, it never runs a sign-in flow. Listing the Resend (email) provider
// here would trip Auth.js's `MissingAdapter` assertion on every request, since
// the adapter can't be included in an edge-compatible config.
export const authConfig: NextAuthConfig = {
  providers: [],
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
