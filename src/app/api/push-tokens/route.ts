import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushTokens } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// Registers (or refreshes) a device push token for the current user.
// Called by the CapacitorBridge component once after a successful push
// registration on iOS or Android.

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token, platform, deviceId, appVersion } = body as {
    token?: string;
    platform?: string;
    deviceId?: string;
    appVersion?: string;
  };

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json(
      { error: "platform must be 'ios' or 'android'" },
      { status: 400 }
    );
  }

  await db
    .insert(pushTokens)
    .values({
      userId: session.user.id,
      token,
      platform,
      deviceId: deviceId ?? null,
      appVersion: appVersion ?? null,
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: {
        userId: session.user.id,
        platform,
        deviceId: deviceId ?? null,
        appVersion: appVersion ?? null,
        lastSeenAt: sql`now()`,
      },
    });

  return NextResponse.json({ ok: true });
}

// Unregister a token (called on sign-out or when device rejects push).
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { error: "token query param required" },
      { status: 400 }
    );
  }

  await db.delete(pushTokens).where(eq(pushTokens.token, token));
  return NextResponse.json({ ok: true });
}
