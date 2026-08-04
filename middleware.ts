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
    // Same reasoning as /volunteer-signup: a committee join link is handed to
    // parents who have no account yet. The page grants nothing on its own —
    // joining only ever writes a signup row keyed to their email address.
    "/committee",
    // An unsubscribe link that demands a sign-in gets the email marked as spam
    // instead. The token is single-purpose and only flips email preferences.
    "/email-preferences",
    // The other half of the volunteer campaign QR code. Same bargain as
    // /volunteer-signup: the page grants nothing, submitting only writes a row
    // keyed to the email address typed into it.
    "/volunteer-interest",
    // A family scanning the hunt QR at the door has no account and needs none —
    // an open hunt plus a valid code is the whole authorization story. The
    // leaderboard endpoint is polled by every playing phone every few seconds,
    // so it has to be public for the same reason the page is.
    "/hunt",
    "/api/hunt",
    // Legal pages must be readable by someone deciding whether to hand us their
    // name and phone number — which is, by definition, before they have an
    // account. A privacy policy behind a login is not a disclosure.
    "/privacy",
    "/terms",
    // Google Play's Data Safety form requires a deletion route reachable
    // WITHOUT installing the app, and a reviewer simply opens the URL. Behind
    // a login it fails that check — and a login wall is also wrong on its own
    // terms, since someone who has lost access to their account is exactly the
    // person most likely to want it deleted. The emailed token is the
    // authorization; the page itself grants nothing.
    "/account/delete",
    // Where a completed deletion lands. Its whole audience is people who no
    // longer have a session.
    "/goodbye",
    // The browser leg of the native OAuth handoff. It runs in the system
    // browser, where the session cookie it needs does exist — but the
    // middleware must not bounce it before Auth.js has finished setting one.
    "/auth/native",
    // The Private Relay merge redemption. Reached from an email, by someone who
    // is signed in as the *relay* account — or, more often, not signed in at
    // all, because they opened the link on a laptop. The token is the
    // authorization, and the page mints the session itself once the merge
    // succeeds. (`/link-account` itself is NOT public — it requires the relay
    // session, which is one half of the proof.)
    "/link-account/confirm",
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
