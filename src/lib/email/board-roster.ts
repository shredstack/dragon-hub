import "server-only";

import { db } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getBoardPositions } from "@/lib/board-positions";
import { fallbackPositionLabel } from "@/lib/board-positions-shared";
import { escapeHtml } from "@/lib/signup-page-content";

export interface BoardRosterMember {
  name: string;
  /** The position's **label** — "Room Parent VP", never the stored slug. */
  position: string;
}

/**
 * The board, in the order the school arranged its own slate.
 *
 * `school_memberships.board_position` stores a **slug** (see the Board
 * Positions section of CLAUDE.md), so both the wording and the order come from
 * `board_positions` — the sign-off on the weekly email is the single most
 * public place a position label appears, and printing `room_parent_vp` at four
 * hundred families is the failure this exists to prevent.
 *
 * A slug with no row (a position deleted out from under a member) still
 * renders, via `fallbackPositionLabel`, and sorts to the end.
 */
export async function getBoardRoster(
  schoolId: string
): Promise<BoardRosterMember[]> {
  const [positions, members] = await Promise.all([
    getBoardPositions(schoolId, { includeInactive: true }),
    db
      .select({
        name: users.name,
        email: users.email,
        slug: schoolMemberships.boardPosition,
      })
      .from(schoolMemberships)
      .innerJoin(users, eq(schoolMemberships.userId, users.id))
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.role, "pta_board"),
          eq(schoolMemberships.status, "approved")
        )
      ),
  ]);

  const order = new Map(positions.map((p, i) => [p.slug, i]));
  const labels = new Map(positions.map((p) => [p.slug, p.label]));

  return members
    .map((m) => ({
      name: m.name || m.email || "Board Member",
      slug: m.slug,
      position: m.slug
        ? labels.get(m.slug) ?? fallbackPositionLabel(m.slug)
        : "Board Member",
    }))
    .sort((a, b) => {
      const ao = a.slug ? order.get(a.slug) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const bo = b.slug ? order.get(b.slug) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      return ao - bo || a.name.localeCompare(b.name);
    })
    .map(({ name, position }) => ({ name, position }));
}

/**
 * The roster as the sign-off block renders it: two people to a line, separated
 * by a pipe, in slate order.
 *
 *     Katie Anderson - President | Britt Shirley - Vice President
 *     Tiffany Taylor - Treasurer | Timette Wankier - Secretary
 *
 * Pairs rather than one name per line because a ten-person board is otherwise
 * ten lines of footer under every email. An odd board leaves the last line with
 * one name on it, which is what you'd write by hand.
 */
export function renderBoardRosterHtml(members: BoardRosterMember[]): string {
  if (members.length === 0) return "";

  const lines: string[] = [];
  for (let i = 0; i < members.length; i += 2) {
    const pair = members
      .slice(i, i + 2)
      .map((m) => `${escapeHtml(m.name)} - ${escapeHtml(m.position)}`)
      .join(" | ");
    lines.push(`<p>${pair}</p>`);
  }
  return lines.join("\n");
}

/** Convenience for the one caller that only wants the HTML. */
export async function getBoardRosterHtml(schoolId: string): Promise<string> {
  return renderBoardRosterHtml(await getBoardRoster(schoolId));
}
