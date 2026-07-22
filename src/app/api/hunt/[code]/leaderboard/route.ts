import { NextResponse } from "next/server";
import { getHuntLeaderboard } from "@/actions/scavenger-hunts";

interface RouteParams {
  params: Promise<{ code: string }>;
}

/**
 * Polled by every phone playing the hunt, roughly every five seconds.
 *
 * Unauthenticated on purpose — an open hunt and a valid code is the whole
 * authorization story. `no-store` matters more than it looks: Vercel's edge
 * will otherwise happily serve one player's board (including their `isYou`
 * flags) to the next phone that asks.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { code } = await params;

  const board = await getHuntLeaderboard(code);
  if (!board) {
    return NextResponse.json(
      { error: "Hunt not available" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(board, {
    headers: { "Cache-Control": "no-store" },
  });
}
