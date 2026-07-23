/**
 * Knowledge Base audience types and pure helpers.
 *
 * Split from `knowledge-audience.ts` because the picker and the article cards
 * are client components: importing the server module for a label map would
 * drag `db` and the auth helpers into the browser bundle.
 *
 * Nothing here touches the database. The visibility rules live next door.
 */

export type VolunteerRole = "room_parent" | "party_volunteer";

/** One audience grant, as the picker and the actions exchange them. */
export type AudienceGrant =
  | { type: "everyone" }
  | { type: "volunteer_role"; volunteerRole: VolunteerRole }
  | { type: "committee"; committeeId: string };

export const VOLUNTEER_ROLE_LABELS: Record<VolunteerRole, string> = {
  room_parent: "Room parents",
  party_volunteer: "Party volunteers",
};

/** The audience rows as any read path returns them. */
export interface AudienceRow {
  audienceType: string;
  volunteerRole: string | null;
  committeeId?: string | null;
  committee?: { name: string; iconEmoji?: string | null } | null;
}

/**
 * How an article's audience reads on a card or a detail header.
 *
 * The empty case is the one that matters: no grants is not "unset", it's
 * board-only, and the label has to say so or the board can't tell at a glance
 * which articles they've actually shared.
 */
export function describeAudiences(audiences: AudienceRow[]): string[] {
  if (audiences.length === 0) return ["PTA Board only"];
  return audiences.map((a) => {
    if (a.audienceType === "everyone") return "Everyone";
    if (a.audienceType === "volunteer_role" && a.volunteerRole) {
      return (
        VOLUNTEER_ROLE_LABELS[a.volunteerRole as VolunteerRole] ??
        a.volunteerRole
      );
    }
    const c = a.committee;
    return c ? `${c.iconEmoji ? `${c.iconEmoji} ` : ""}${c.name}` : "Committee";
  });
}

/** Rebuild picker state from stored rows. */
export function toAudienceGrants(audiences: AudienceRow[]): AudienceGrant[] {
  const grants: AudienceGrant[] = [];
  for (const a of audiences) {
    if (a.audienceType === "everyone") grants.push({ type: "everyone" });
    else if (a.audienceType === "volunteer_role" && a.volunteerRole) {
      grants.push({
        type: "volunteer_role",
        volunteerRole: a.volunteerRole as VolunteerRole,
      });
    } else if (a.audienceType === "committee" && a.committeeId) {
      grants.push({ type: "committee", committeeId: a.committeeId });
    }
  }
  return grants;
}
