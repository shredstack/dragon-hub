import { NextResponse } from "next/server";
import {
  openNativeAuthTicket,
  NATIVE_AUTH_FLOW_COOKIE,
  NATIVE_AUTH_FLOW_COOKIE_OPTIONS,
} from "@/lib/native-auth-tickets";
import {
  isAppleAuthConfigured,
  isGoogleAuthConfigured,
} from "@/lib/auth-providers";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * The first leg of the native OAuth handoff, running in the **system browser**.
 *
 * The app opens this URL in SFSafariViewController / a Custom Tab. It records
 * the app-generated nonce, then hands off to Auth.js's ordinary sign-in flow
 * with a callback pointed at `/auth/native/return`, which is where the round
 * trip comes back to.
 *
 * Deliberately a redirect rather than a page: there is nothing to render, and
 * a flash of DragonHub chrome inside the browser sheet before Google's screen
 * looks like a phishing page.
 */
export async function GET(request: Request) {
  // This route writes a row per call and needs no credential to reach, so it
  // gets its own meter rather than being the one leg of the flow with none.
  const limit = await checkRateLimit(
    RATE_LIMITS.nativeAuthStartPerIp,
    `native_start:${await getClientIp()}`
  );
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const url = new URL(request.url);
  const provider = url.searchParams.get("provider");
  const nonce = url.searchParams.get("nonce");

  if (provider !== "google" && provider !== "apple") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (
    (provider === "google" && !isGoogleAuthConfigured()) ||
    (provider === "apple" && !isAppleAuthConfigured())
  ) {
    return NextResponse.json(
      { error: "Provider is not configured" },
      { status: 400 }
    );
  }
  if (!nonce) {
    return NextResponse.json({ error: "Missing nonce" }, { status: 400 });
  }

  try {
    await openNativeAuthTicket({ nonce, provider });
  } catch {
    return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
  }

  // Auth.js's own sign-in entry point. The callback is relative, so it can
  // never be pointed off-origin by a crafted request to this route.
  const target = new URL(`/api/auth/signin/${provider}`, url.origin);
  target.searchParams.set(
    "callbackUrl",
    `/auth/native/return?nonce=${encodeURIComponent(nonce)}`
  );

  const response = NextResponse.redirect(target);
  // Pins the rest of the flow to this browser. `/auth/native/return` refuses to
  // bind a session without it, so the nonce in the query string is not on its
  // own enough to complete a sign-in somewhere else.
  response.cookies.set(
    NATIVE_AUTH_FLOW_COOKIE,
    nonce,
    NATIVE_AUTH_FLOW_COOKIE_OPTIONS
  );
  return response;
}
