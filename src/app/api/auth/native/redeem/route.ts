import { NextResponse } from "next/server";
import { redeemNativeAuthTicket } from "@/lib/native-auth-tickets";
import { createNativeSessionCookie } from "@/lib/native-session";
import {
  checkRateLimit,
  getClientIp,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { isPrivateRelayAddress } from "@/lib/account-merge-shared";

/**
 * The last leg, running **inside the WebView**.
 *
 * That is the entire point of this route existing: the `Set-Cookie` it returns
 * lands in the WebView's cookie jar, which is the one the app actually uses.
 * The identical cookie set in the system browser is unreachable.
 *
 * POST only. A GET would be reachable from a link and, being a navigation,
 * would carry the browser's cookies — turning a captured ticket into a
 * one-click session mint. The nonce check is the real defense, but a method
 * that cannot be triggered by navigation is worth having underneath it.
 */
export async function POST(request: Request) {
  const limit = await checkRateLimit(
    RATE_LIMITS.demoLoginPerIp,
    `native_redeem:${await getClientIp()}`
  );
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticket, nonce } = body as { ticket?: string; nonce?: string };
  if (!ticket || !nonce) {
    return NextResponse.json(
      { error: "ticket and nonce are required" },
      { status: 400 }
    );
  }

  const result = await redeemNativeAuthTicket({ ticket, nonce });
  if (!result) {
    // One message for every failure mode — expired, already used, wrong nonce,
    // never issued. Distinguishing them tells an attacker which half they got
    // right.
    return NextResponse.json({ error: "Invalid ticket" }, { status: 401 });
  }

  const cookie = await createNativeSessionCookie(result.userId);
  const response = NextResponse.json({
    ok: true,
    redirectTo: await landingPathFor(result.userId),
  });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

/**
 * Where to drop the user after a native sign-in.
 *
 * Mirrors the redirect logic in `(app)/layout.tsx`, plus the Private Relay
 * case: an Apple user who chose "Hide My Email" has an address that matches no
 * signup row and no membership, so the generic `/join-school` wall would ask
 * them for a code they have no reason to possess while their real account sits
 * untouched under their own address. `/link-account` is the flow that joins
 * the two.
 */
async function landingPathFor(userId: string): Promise<string> {
  const [user, membership] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    }),
    db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.status, "approved")
      ),
      columns: { id: true },
    }),
  ]);

  if (membership) return "/dashboard";
  if (isPrivateRelayAddress(user?.email)) return "/link-account";
  return "/join-school";
}
