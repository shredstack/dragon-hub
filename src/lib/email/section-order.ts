import "server-only";

import { db } from "@/lib/db";
import { emailSections } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { footerStartIndex } from "@/lib/email/section-order-shared";

export interface OrderedSection {
  id: string;
  recurringKey: string | null;
  sortOrder: number;
}

/**
 * Reserves `count` sort orders for new news sections at the end of the *news*,
 * and pushes the trailing run of recurring sections down past them. Returns the
 * sort order for the first new section; the caller increments from there.
 *
 * "End of the news" rather than end of the email — see `footerStartIndex` in
 * `section-order-shared.ts` for why, and for what counts as the footer.
 *
 * It lives here because there are three ways a section reaches an email and
 * they are in three files: the bulk re-check (`attachRelevantContent`), the
 * inbox's per-item "Add" button (`includeContentInCampaign`), and the blank
 * "Add Section" button (`addEmailSection`). The last two each shipped their own
 * `max(sort_order) + 1` and filed underneath the sign-off — the same bug,
 * through the other doors.
 *
 * Authorization is the caller's job, as it is for `attachRecurringSections`.
 */
export async function reserveNewsSortOrders(
  campaignId: string,
  count: number,
  known?: OrderedSection[]
): Promise<number> {
  const existing =
    known ??
    (await db.query.emailSections.findMany({
      where: eq(emailSections.campaignId, campaignId),
      columns: { id: true, recurringKey: true, sortOrder: true },
      orderBy: [asc(emailSections.sortOrder)],
    }));

  const tailStart = footerStartIndex(existing);

  // From the top of the head, not from `tailStart` — sort orders are only
  // guaranteed to be increasing, not contiguous.
  const start =
    existing
      .slice(0, tailStart)
      .reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;

  if (count <= 0) return start;

  let after = start + count;
  for (const section of existing.slice(tailStart)) {
    await db
      .update(emailSections)
      .set({ sortOrder: after++, updatedAt: new Date() })
      .where(eq(emailSections.id, section.id));
  }

  return start;
}
