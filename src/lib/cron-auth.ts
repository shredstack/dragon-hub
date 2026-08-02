import { createHash, timingSafeEqual } from "crypto";

/**
 * The shared guard on every `/api/cron/*` route.
 *
 * Vercel invokes these on the schedules in `vercel.json`, sending
 * `Authorization: Bearer $CRON_SECRET` — but **only when that variable exists
 * in the deployment's environment**. With it unset, Vercel sends no auth header
 * at all and the naive check (`header !== \`Bearer ${process.env.CRON_SECRET}\``)
 * compares against the literal string "Bearer undefined" and returns a bare 401.
 *
 * That is not a hypothetical: production ran without `CRON_SECRET` and every
 * cron 401'd for nine days. Nothing surfaced it, because a rejected cron looks
 * identical to a cron that was never scheduled — no error, no alert, just data
 * that quietly stops moving. It was found by noticing a wrong date on the
 * calendar.
 *
 * So the point of this helper is not the auth check, which was already correct.
 * It is that the three ways a cron can fail to authenticate are three *different
 * operational problems* and must be distinguishable from the logs alone:
 *
 * | Log line | What actually happened | Fix |
 * |---|---|---|
 * | `CRON_SECRET is not set` (500) | The variable is missing from this environment | Set it in Vercel, then redeploy |
 * | `secret mismatch (from vercel-cron)` (401) | Vercel has a value this build doesn't — rotated after the last build | Redeploy production |
 * | `no bearer token` / mismatch from another UA (401) | Something else hit the URL | Nothing; this is the guard working |
 *
 * The middle row is the one worth spelling out: Vercel bakes environment values
 * into a deployment at build time, so setting or rotating the variable does
 * nothing to the *running* functions until the next production deploy. A cron
 * that still 401s after the value is visibly correct in the dashboard is the
 * expected symptom, not a second bug.
 */

/** A missing secret is a deployment fault, not a caller fault — hence 500. */
function misconfigured(job: string): Response {
  console.error(
    `[cron:${job}] CRON_SECRET is not set in this environment — refusing the request. ` +
      `Vercel omits the Authorization header entirely when the variable is absent, ` +
      `so every cron will fail this way until it is set AND production is redeployed.`
  );
  return Response.json(
    { success: false, error: "Cron is not configured" },
    { status: 500 }
  );
}

function unauthorized(job: string, reason: string): Response {
  console.warn(`[cron:${job}] rejected: ${reason}`);
  return new Response("Unauthorized", { status: 401 });
}

/**
 * Compare without leaking length through timing. `timingSafeEqual` throws on
 * buffers of unequal length, and padding to compare would leak that length
 * anyway, so both sides are hashed to a fixed 32 bytes first.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Returns a `Response` to send back when the request is **not** an authorized
 * cron invocation, or `null` when it is and the route should proceed.
 *
 * `job` names the route in the logs (`"sync-calendar"`), so a 401 says which
 * schedule stopped running.
 */
export function rejectUnauthorizedCron(
  request: Request,
  job: string
): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return misconfigured(job);

  const authHeader = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") ?? "";
  // Vercel's scheduler identifies itself as `vercel-cron/1.0`. It is not a
  // credential and is trivially spoofable — it is only used to word the log
  // line, never to grant access.
  const fromVercelCron = userAgent.startsWith("vercel-cron");

  if (!authHeader?.startsWith("Bearer ")) {
    return unauthorized(
      job,
      fromVercelCron
        ? `no bearer token from vercel-cron, which means this deployment was built without CRON_SECRET — redeploy production`
        : `no bearer token (user-agent: ${userAgent || "none"})`
    );
  }

  if (!secretsMatch(authHeader.slice("Bearer ".length), expected)) {
    return unauthorized(
      job,
      fromVercelCron
        ? `secret mismatch from vercel-cron — Vercel is sending a different value than this build has, so CRON_SECRET was changed after the last production deploy; redeploy production`
        : `secret mismatch (user-agent: ${userAgent || "none"})`
    );
  }

  return null;
}
