import { headers } from "next/headers";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitHits } from "@/lib/db/schema";

/**
 * Rate limiting for the endpoints an anonymous stranger can reach.
 *
 * Three of them matter, and they matter for different reasons:
 *
 *   - `submitVolunteerSignup` / `recordCampaignInterest` / committee joins mint
 *     a 72-hour one-click sign-in link and email it to whatever address was
 *     typed. Unmetered, that is a mail-bomb aimed at any parent whose address
 *     you know, and a way to burn the school's sending reputation on the one
 *     night it is needed.
 *   - `joinSchool` resolves a *school* from a globally unique code, so a wrong
 *     guess costs the guesser nothing and a right one is a membership.
 *
 * A fixed window rather than a sliding one: it is a couple of lines of SQL, it
 * can't drift, and the failure mode (up to 2x the limit across a window
 * boundary) is irrelevant at these numbers. There is no Redis in this stack and
 * a PTA's traffic fits in one indexed upsert.
 */

export interface RateLimitRule {
  /** Namespace for the counter. */
  action: string;
  /** How many attempts are allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /**
   * Public volunteer / committee / campaign signups, per IP. A family at Back
   * to School Night shares one venue Wi-Fi NAT, so this has to be generous
   * enough that a queue of parents on the same public IP never hits it — the
   * per-email limit below is the one doing the real work.
   */
  signupPerIp: { action: "signup:ip", limit: 60, windowSeconds: 3600 },
  /**
   * The same signups, per email address. A parent legitimately re-submits to
   * add a party they missed; nobody legitimately submits for one address
   * eight times an hour.
   */
  signupPerEmail: { action: "signup:email", limit: 8, windowSeconds: 3600 },
  /** Join-code redemption, per IP. Guessing is the whole threat here. */
  joinCodePerIp: { action: "join_code:ip", limit: 10, windowSeconds: 900 },
  /** Join-code redemption, per account, so rotating IPs doesn't buy much. */
  joinCodePerUser: { action: "join_code:user", limit: 10, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  ok: boolean;
  /** Attempts remaining in the current window. */
  remaining: number;
  /** When the current window ends, for a "try again at" message. */
  resetAt: Date;
}

/**
 * The caller's IP, as far as we can tell behind Vercel's proxy.
 *
 * `x-forwarded-for` is client-controllable in general, but Vercel overwrites it
 * at the edge, so the *first* entry is trustworthy on this deployment. Falling
 * back to a shared bucket rather than to "no limit" matters: an unlimited path
 * is exactly what an attacker would aim for by stripping the header.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

function windowStartFor(windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms);
}

/**
 * Count one attempt against a rule and say whether it is allowed.
 *
 * The insert-or-increment is a single statement so two concurrent requests
 * can't both read a count of 4 and both decide they're the fifth.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string
): Promise<RateLimitResult> {
  const windowStart = windowStartFor(rule.windowSeconds);
  const resetAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000);

  try {
    const [row] = await db
      .insert(rateLimitHits)
      .values({ action: rule.action, subject, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [
          rateLimitHits.action,
          rateLimitHits.subject,
          rateLimitHits.windowStart,
        ],
        set: { count: sql`${rateLimitHits.count} + 1` },
      })
      .returning({ count: rateLimitHits.count });

    const count = row?.count ?? 1;
    return {
      ok: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAt,
    };
  } catch (error) {
    // A limiter that takes the app down with it is worse than one that lets a
    // request through. Fail open, but loudly.
    console.error("Rate limit check failed:", error);
    return { ok: true, remaining: rule.limit, resetAt };
  }
}

/**
 * Check several rules at once. Every rule is counted even when an earlier one
 * has already failed — otherwise the per-email counter would stop advancing
 * the moment the per-IP one tripped, and the attacker would get a fresh email
 * budget by switching IP.
 */
export async function checkRateLimits(
  checks: Array<{ rule: RateLimitRule; subject: string }>
): Promise<RateLimitResult> {
  const results = await Promise.all(
    checks.map(({ rule, subject }) => checkRateLimit(rule, subject))
  );
  const failed = results.find((r) => !r.ok);
  return failed ?? results[0];
}

/** Wording shown to a parent who has tripped a limit. Never mentions the rule. */
export function rateLimitMessage(result: RateLimitResult): string {
  const minutes = Math.max(
    1,
    Math.ceil((result.resetAt.getTime() - Date.now()) / 60000)
  );
  return `Too many attempts. Please try again in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }.`;
}

/**
 * Discard windows nobody will read again. Called from the daily cron rather
 * than on the request path — this table is written on every public submit and
 * a sweep there would pay for itself on the wrong side of the transaction.
 */
export async function pruneRateLimitHits(olderThanHours = 48): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000);
  const deleted = await db
    .delete(rateLimitHits)
    .where(lt(rateLimitHits.windowStart, cutoff))
    .returning({ id: rateLimitHits.id });
  return deleted.length;
}

/** Exported for tests / diagnostics: current count without incrementing it. */
export async function peekRateLimit(
  rule: RateLimitRule,
  subject: string
): Promise<number> {
  const row = await db.query.rateLimitHits.findFirst({
    where: and(
      eq(rateLimitHits.action, rule.action),
      eq(rateLimitHits.subject, subject),
      eq(rateLimitHits.windowStart, windowStartFor(rule.windowSeconds))
    ),
    columns: { count: true },
  });
  return row?.count ?? 0;
}
