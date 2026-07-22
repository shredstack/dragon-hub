import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // /event-invite is public on purpose: its whole audience is people who don't
  // have an account yet. Bouncing them to a bare sign-in page would ask them to
  // sign in to an app they've never heard of, with no sign of what they were
  // invited to. The page itself grants nothing — accepting still requires
  // signing in as the invited address.
  const publicRoutes = [
    "/sign-in",
    "/verify-request",
    "/error",
    "/volunteer-signup",
    "/event-invite",
  ];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));
  const isAuthApi = pathname.startsWith("/api/auth");
  const isCronApi = pathname.startsWith("/api/cron");

  if (isPublicRoute || isAuthApi || isCronApi) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
