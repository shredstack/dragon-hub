import "server-only";
import { db } from "@/lib/db";
import { nativeAuthTickets } from "@/lib/db/schema";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * The one-time tickets that carry a completed OAuth result from the system
 * browser back into the app's WebView.
 *
 * Every property below is load-bearing against a specific attack; see the
 * comment on `nativeAuthTickets` in the schema for the shape.
 *
 * **Known residual risk, deliberately documented rather than hand-waved.** The
 * callback is a private-use URI scheme (`dragonhub://`), which RFC 8252 §8.1
 * warns is not exclusive on either platform. The nonce stops a malicious app
 * that captures that callback from redeeming a ticket it did not initiate —
 * but it cannot stop an attacker who *also* chooses the nonce, by mailing a
 * victim a crafted `/api/auth/native/start?nonce=…` link and capturing the
 * resulting ticket with such an app. Everything below narrows that: the flow
 * is pinned to one browser (`NATIVE_AUTH_FLOW_COOKIE`), rate limited, and
 * five minutes long. Closing it completely requires a claimed HTTPS callback
 * (Universal Links / App Links), which another app cannot register — that is
 * the fix, and it needs the Associated Domains entitlement plus on-device
 * verification, not another server-side check.
 */

/** Five minutes is a round trip through a sign-in screen, not a session. */
const TICKET_TTL_MS = 5 * 60 * 1000;

/**
 * Pins a sign-in flow to the browser that opened it.
 *
 * Set on the redirect out of `/api/auth/native/start` and required to still
 * match at `/auth/native/return`. Without it the two legs are joined only by a
 * nonce in a query string, so anyone holding that nonce can complete a flow in
 * *any* browser — including by feeding a victim a bare Auth.js `callbackUrl`
 * link that skips `/start` entirely.
 *
 * `SameSite=Lax` and not `Strict`: the return leg arrives via a redirect chain
 * that begins at the provider, and `Strict` would drop the cookie on exactly
 * the request that needs it.
 */
export const NATIVE_AUTH_FLOW_COOKIE = "dragonhub-native-flow";

export const NATIVE_AUTH_FLOW_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  // Narrower than "/" so it rides only on the return leg, and never on the
  // hundreds of ordinary requests the same browser makes to this origin.
  path: "/auth/native",
  maxAge: TICKET_TTL_MS / 1000,
} as const;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Step 1, in the browser: record the app-generated nonce before OAuth starts.
 *
 * The nonce is generated *in the app*, and for a flow the app really did start
 * it never goes anywhere else — which is what makes a ticket captured from the
 * `dragonhub://` callback useless to another app: custom URL schemes are not
 * exclusive on either platform, so a malicious app can register `dragonhub://`
 * and receive the callback, but it never saw the nonce.
 *
 * That argument holds only for flows the app started. See the residual risk at
 * the top of this file for the one it does not cover.
 */
export async function openNativeAuthTicket(params: {
  nonce: string;
  provider: string;
}): Promise<void> {
  const nonce = params.nonce.trim();
  // Long enough that guessing is not a strategy; short enough to be a URL.
  if (nonce.length < 20 || nonce.length > 200) {
    throw new Error("Invalid nonce");
  }

  await db
    .insert(nativeAuthTickets)
    .values({
      nonce,
      provider: params.provider,
      expiresAt: new Date(Date.now() + TICKET_TTL_MS),
    })
    // A retried start (the user backing out and trying again) reuses the row
    // rather than colliding on the unique nonce.
    .onConflictDoUpdate({
      target: nativeAuthTickets.nonce,
      set: {
        provider: params.provider,
        expiresAt: new Date(Date.now() + TICKET_TTL_MS),
        ticketHash: null,
        userId: null,
        consumedAt: null,
      },
    });
}

/**
 * Step 2, still in the browser: OAuth succeeded, so bind the user and mint the
 * ticket.
 *
 * Returns the raw ticket, which is the only time it exists in plaintext — the
 * row stores nothing but its hash, so reading the table yields no usable
 * ticket.
 *
 * Rejects a nonce this server did not issue, which is what stops someone
 * driving the flow from outside the app.
 *
 * `flowCookie` is the value `/api/auth/native/start` planted in this browser,
 * and it is a parameter rather than a check the caller does first so that a
 * future second caller cannot quietly skip it.
 */
export async function bindNativeAuthTicket(params: {
  nonce: string;
  userId: string;
  flowCookie: string | undefined;
}): Promise<string | null> {
  // Same browser, same flow. A missing cookie means this leg was reached
  // without going through `/start` — a hand-built `callbackUrl` link, or a
  // different browser than the one that opened the sign-in.
  if (
    !params.flowCookie ||
    !constantTimeEquals(params.flowCookie, params.nonce)
  ) {
    return null;
  }

  const ticket = randomBytes(32).toString("base64url");

  const [row] = await db
    .update(nativeAuthTickets)
    .set({ ticketHash: hash(ticket), userId: params.userId })
    .where(
      and(
        eq(nativeAuthTickets.nonce, params.nonce),
        isNull(nativeAuthTickets.consumedAt),
        sql`${nativeAuthTickets.expiresAt} > now()`
      )
    )
    .returning({ id: nativeAuthTickets.id });

  return row ? ticket : null;
}

/**
 * Step 3, inside the WebView: exchange the ticket for the user it stands for.
 *
 * Consumption is a single atomic `UPDATE … WHERE consumed_at IS NULL
 * RETURNING`, so two concurrent redemptions cannot both succeed — the loser
 * gets no row back rather than a second session.
 *
 * The nonce is checked here, not only at bind time, because this is the step
 * that runs after the ticket has been through a URL that another app may have
 * seen.
 */
export async function redeemNativeAuthTicket(params: {
  ticket: string;
  nonce: string;
}): Promise<{ userId: string } | null> {
  const ticketHash = hash(params.ticket);

  const [row] = await db
    .update(nativeAuthTickets)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(nativeAuthTickets.ticketHash, ticketHash),
        isNull(nativeAuthTickets.consumedAt),
        sql`${nativeAuthTickets.expiresAt} > now()`
      )
    )
    .returning({
      userId: nativeAuthTickets.userId,
      nonce: nativeAuthTickets.nonce,
    });

  if (!row?.userId) return null;

  // Constant-time, and after consumption: a wrong nonce has still burned the
  // ticket, so a captured ticket cannot be retried against guessed nonces.
  if (!constantTimeEquals(row.nonce, params.nonce)) {
    console.warn("Native auth redeem rejected: nonce mismatch");
    return null;
  }

  return { userId: row.userId };
}

/** Housekeeping. Expired tickets are inert, but the table shouldn't grow. */
export async function pruneNativeAuthTickets(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(nativeAuthTickets)
    .where(lt(nativeAuthTickets.createdAt, cutoff))
    .returning({ id: nativeAuthTickets.id });
  return deleted.length;
}

function constantTimeEquals(a: string, b: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}
