import "server-only";

import { db } from "@/lib/db";
import {
  emailRecurringSections,
  emailSections,
  schools,
} from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { parseImagePosition } from "@/lib/email/image-position";
import { parseImageWidth } from "@/lib/email/image-width";
import { getBoardRosterHtml } from "@/lib/email/board-roster";
import { ensureBoardSignoffSection } from "@/lib/email/recurring-defaults";

interface SchoolContext {
  name: string;
  schoolYear?: string | null;
}

/**
 * Processes template variables in recurring section body templates.
 * Replaces placeholders like {{school_name}}, {{board_roster}}, etc.
 *
 * `rosterHtml` arrives already rendered — see `src/lib/email/board-roster.ts`.
 * The position on a membership row is a **slug**, so building the roster here
 * off `board_position` is how a footer ends up reading "Sarah Dorich -
 * room_parent_vp" in front of the whole school.
 */
function processTemplateVariables(
  bodyTemplate: string,
  school: SchoolContext,
  rosterHtml: string
): string {
  let body = bodyTemplate;

  // Replace school-related variables
  body = body.replace(/\{\{school_name\}\}/g, school.name);
  body = body.replace(
    /\{\{school_year\}\}/g,
    school.schoolYear || new Date().getFullYear().toString()
  );

  body = body.replace(/\{\{board_roster\}\}/g, rosterHtml);

  // Note: Other variables like {{membership_link}}, {{member_count}}, etc.
  // would need additional context to be replaced. For now, they remain as-is
  // and can be configured in the recurring section body itself.

  return body;
}

/**
 * Puts the school's recurring sections into a campaign at their configured
 * positions, skipping any whose `key` the campaign already carries.
 *
 * This is the board roster and the "thank you for supporting the PTA" sign-off
 * — the blocks that belong on *every* email, which is exactly why they cannot
 * live only on the AI path. An email started blank or cloned from last week
 * gets them the same way a generated one does.
 *
 * Positioning is relative to whatever is already there, so it must run **last**
 * — after the submitted content has been pulled in — or "last section" means
 * last of nothing. Idempotent by `recurring_key`: a clone that already carries
 * the footer is left alone, and a recurring section added since last week is
 * the only thing that gets inserted.
 *
 * It lives here rather than in the action file so that authorization is the
 * caller's job and stays in one layer — every entry point in
 * `src/actions/email-campaigns.ts` has already asserted board membership by the
 * time it gets here.
 */
export async function attachRecurringSections(
  campaignId: string,
  schoolId: string
) {
  // The sign-off is not optional-until-configured. A school that never opened
  // Email Settings still ends its emails with "Thanks again" and its board.
  await ensureBoardSignoffSection(schoolId);

  const recurring = await db.query.emailRecurringSections.findMany({
    where: and(
      eq(emailRecurringSections.schoolId, schoolId),
      eq(emailRecurringSections.active, true)
    ),
    orderBy: [asc(emailRecurringSections.defaultSortOrder)],
  });
  if (recurring.length === 0) return;

  const existing = await db.query.emailSections.findMany({
    where: eq(emailSections.campaignId, campaignId),
    columns: { id: true, recurringKey: true, sortOrder: true },
    orderBy: [asc(emailSections.sortOrder)],
  });
  const alreadyIn = new Set(
    existing.map((s) => s.recurringKey).filter(Boolean) as string[]
  );

  const missing = recurring.filter((s) => !alreadyIn.has(s.key));
  if (missing.length === 0) return;

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { name: true, currentSchoolYear: true },
  });
  const rosterHtml = await getBoardRosterHtml(schoolId);
  const schoolContext: SchoolContext = {
    name: school?.name || "School",
    schoolYear: school?.currentSchoolYear,
  };

  // Lay the existing sections and the missing recurring ones out in one
  // ordered list, then renumber. `from_start` counts from the top of the
  // finished email and `from_end` from the bottom.
  type Slot =
    | { kind: "existing"; id: string }
    | { kind: "new"; section: (typeof missing)[number] };

  // Positions are indices into the **finished** email, so the slots are
  // claimed against its final length and the content falls into what's left.
  //
  // Splicing them in one at a time — which is what this did before — measures
  // each position against a list that already grew, so "4th from last" lands
  // 4th from last *of the sections placed so far*. With four recurring blocks
  // and two submissions that interleaved them: join_pta, volunteer, news A,
  // yearbook, news B, sign-off.
  const total = existing.length + missing.length;
  const slots: Array<(typeof missing)[number] | null> = new Array(total).fill(
    null
  );

  const byPosition = (a: (typeof missing)[number], b: (typeof missing)[number]) =>
    a.positionIndex - b.positionIndex || a.defaultSortOrder - b.defaultSortOrder;

  /** First free slot at or after `from`, else the first free slot anywhere. */
  const claimForward = (from: number) => {
    for (let i = Math.max(0, from); i < total; i++) if (!slots[i]) return i;
    for (let i = 0; i < total; i++) if (!slots[i]) return i;
    return -1;
  };

  /** First free slot at or before `from`, else the last free slot anywhere. */
  const claimBackward = (from: number) => {
    for (let i = Math.min(total - 1, from); i >= 0; i--) if (!slots[i]) return i;
    for (let i = total - 1; i >= 0; i--) if (!slots[i]) return i;
    return -1;
  };

  // Ascending, so "1st" claims before "2nd" and two sections asking for the
  // same spot resolve by defaultSortOrder rather than by array order.
  for (const section of missing
    .filter((s) => s.positionType === "from_start")
    .sort(byPosition)) {
    const at = claimForward(section.positionIndex);
    if (at >= 0) slots[at] = section;
  }

  // Ascending too: index 0 is "last", so it claims the final slot first and
  // "2nd to last" takes the one above it.
  for (const section of missing
    .filter((s) => s.positionType === "from_end")
    .sort(byPosition)) {
    const at = claimBackward(total - 1 - section.positionIndex);
    if (at >= 0) slots[at] = section;
  }

  const remaining = [...existing];
  const laidOut: Slot[] = slots.map((section) =>
    section
      ? ({ kind: "new", section } as const)
      : ({ kind: "existing", id: remaining.shift()!.id } as const)
  );

  for (let i = 0; i < laidOut.length; i++) {
    const slot = laidOut[i];
    if (slot.kind === "existing") {
      await db
        .update(emailSections)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(eq(emailSections.id, slot.id));
      continue;
    }
    const section = slot.section;
    await db.insert(emailSections).values({
      campaignId,
      title: section.title,
      body: processTemplateVariables(
        section.bodyTemplate,
        schoolContext,
        rosterHtml
      ),
      linkUrl: section.linkUrl,
      linkText: section.linkText,
      imageUrl: section.imageUrl,
      imagePosition: parseImagePosition(section.imagePosition),
      imageWidth: parseImageWidth(section.imageWidth),
      audience: section.audience,
      sectionType: "recurring",
      recurringKey: section.key,
      sortOrder: i,
    });
  }
}
