import "server-only";

import { db } from "@/lib/db";
import { emailRecurringSections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { EmailAudience, SectionPositionType } from "@/types";

export interface DefaultRecurringSection {
  key: string;
  title: string;
  bodyTemplate: string;
  audience: EmailAudience;
  positionType: SectionPositionType;
  positionIndex: number;
  defaultSortOrder: number;
}

/**
 * The block that ends every email: "Thanks again," the school's name and year,
 * and the board roster.
 *
 * It is separated from the rest of the defaults below because it is the only
 * one that is **universal**. "Join PTA", "Volunteer Opportunities" and
 * "Yearbook" carry a particular school's links and are opt-in; a sign-off is
 * something every PTA email has, so this one is seeded on demand rather than
 * waiting for someone to find /emails/settings and press a button.
 */
export const BOARD_SIGNOFF_KEY = "board_signoff";

export const BOARD_SIGNOFF_SECTION: DefaultRecurringSection = {
  key: BOARD_SIGNOFF_KEY,
  title: "",
  bodyTemplate: `<p>Thanks again,</p>
<p>{{school_name}} PTA Board {{school_year}}</p>
{{board_roster}}`,
  audience: "all",
  positionType: "from_end",
  positionIndex: 0, // Last position
  defaultSortOrder: 99,
};

export const DEFAULT_RECURRING_SECTIONS: DefaultRecurringSection[] = [
  {
    key: "join_pta",
    title:
      "Join PTA -- Please encourage others to join, share this link with Grandparents, Spouses, Friends",
    bodyTemplate: `<p><a href="{{membership_link}}">{{membership_link}}</a></p>
<p><strong>We now have {{member_count}} members! Thank you for joining. Please encourage others. Our goal is 300 members.</strong></p>`,
    audience: "all",
    positionType: "from_end",
    positionIndex: 3, // 4th from last
    defaultSortOrder: 0,
  },
  {
    key: "volunteer",
    title:
      "VOLUNTEER OPPORTUNITIES - we list all volunteer sign-ups here on our linktree",
    bodyTemplate: `<p><a href="{{linktree_url}}"><strong>{{linktree_url}}</strong></a></p>
<p><strong>Also follow us on instagram @draperelementarypta</strong></p>`,
    audience: "all",
    positionType: "from_end",
    positionIndex: 2, // 3rd from last
    defaultSortOrder: 0,
  },
  {
    key: "yearbook",
    title: "YEARBOOK -- BUY YOUR BOOK",
    bodyTemplate: `<p>If you signed a social media opt-out form, please remember that it also applies to the yearbook <strong>unless</strong> you speak with the Principal. Students with a media opt-out cannot be included in the yearbook.</p>
<p><strong>Don't miss out—order your yearbook now!</strong> <a href="{{yearbook_link}}">{{yearbook_link}}</a></p>`,
    audience: "all",
    positionType: "from_end",
    positionIndex: 1, // 2nd from last
    defaultSortOrder: 0,
  },
  BOARD_SIGNOFF_SECTION,
];

/**
 * Gives a school the board sign-off if it hasn't got a row for it, and returns
 * nothing either way.
 *
 * This is a lazy backfill on the write path, the same shape as
 * `getBoardPositionsWithSeed()`, and it exists because the previous design made
 * the footer conditional on a board member visiting Email Settings and pressing
 * "Add standard sections". Schools that never did — including ones that had
 * written a recurring section of their own, so the empty-state prompt never
 * showed — sent every email with no sign-off and no roster.
 *
 * **Presence of the key is what's respected, not `active`.** A board that
 * doesn't want a sign-off switches it off in Email Settings; the row stays, so
 * this sees it and does nothing. That is why the toggle is the way to turn it
 * off and deleting the row is not.
 */
export async function ensureBoardSignoffSection(schoolId: string) {
  const existing = await db.query.emailRecurringSections.findFirst({
    where: and(
      eq(emailRecurringSections.schoolId, schoolId),
      eq(emailRecurringSections.key, BOARD_SIGNOFF_KEY)
    ),
    columns: { id: true },
  });
  if (existing) return;

  await db
    .insert(emailRecurringSections)
    .values({
      schoolId,
      key: BOARD_SIGNOFF_SECTION.key,
      title: BOARD_SIGNOFF_SECTION.title,
      bodyTemplate: BOARD_SIGNOFF_SECTION.bodyTemplate,
      audience: BOARD_SIGNOFF_SECTION.audience,
      positionType: BOARD_SIGNOFF_SECTION.positionType,
      positionIndex: BOARD_SIGNOFF_SECTION.positionIndex,
      defaultSortOrder: BOARD_SIGNOFF_SECTION.defaultSortOrder,
    })
    // Two campaigns created in the same second would both find it missing;
    // the (school_id, key) unique index arbitrates.
    .onConflictDoNothing({
      target: [emailRecurringSections.schoolId, emailRecurringSections.key],
    });
}
