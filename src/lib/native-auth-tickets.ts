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
 */

/** Five minutes is a round trip through a sign-in screen, not a session. */
const TICKET_TTL_MS = 5 * 60 * 1000;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Step 1, in the browser: record the app-generated nonce before OAuth starts.
 *
 * The nonce is generated *in the app* and never leaves the device except in
 * this call and the final redeem. That is what makes a ticket captured from
 * the `dragonhub://` callback useless to another app: custom URL schemes are
 * not exclusive on either platform, so a malicious app can register
 * `dragonhub://` and receive the callback — but it never saw the nonce.
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
 */
export async function bindNativeAuthTicket(params: {
  nonce: string;
  userId: string;
}): Promise<string | null> {
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
