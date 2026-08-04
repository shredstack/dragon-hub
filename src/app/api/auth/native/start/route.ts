import { NextResponse } from "next/server";
import { openNativeAuthTicket } from "@/lib/native-auth-tickets";
import {
  isAppleAuthConfigured,
  isGoogleAuthConfigured,
} from "@/lib/auth-providers";

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

  return NextResponse.redirect(target);
}
