import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * The bell's poll target.
 *
 * Deliberately a route handler rather than a server action: the bell checks
 * this every 60 seconds and on every tab focus, and a server action would make
 * each of those a round trip that re-renders the page tree. This returns one
 * integer and touches nothing else.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, session.user.id),
        isNull(notifications.readAt)
      )
    );

  return NextResponse.json(
    { count: row?.count ?? 0 },
    // A count that is 60 seconds stale is the poll interval anyway; a cached
    // one would be indefinitely stale and belong to whoever asked first.
    { headers: { "Cache-Control": "no-store" } }
  );
}
