"use client";

import { promoteWaitlistedMember, removeCommitteeMember } from "@/actions/committees";
import {
  WaitlistTable as SharedWaitlistTable,
  WouldChairBadge,
} from "@/components/volunteer/waitlist-panel";

export interface WaitlistEntry {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  position: number;
  willingToChair: boolean;
  notes: string | null;
}

/**
 * A committee's waitlist, in order, with a promote-out-of-order button.
 *
 * The table itself is shared with every other waitlist in the app (see
 * `components/volunteer/waitlist-panel`) — all this adds is the committee's
 * server actions and its one committee-specific chip.
 */
export function WaitlistTable({ entries }: { entries: WaitlistEntry[] }) {
  return (
    <SharedWaitlistTable
      entries={entries.map((e) => ({
        ...e,
        badges: e.willingToChair ? <WouldChairBadge /> : null,
      }))}
      where="this committee"
      onPromote={(person) => promoteWaitlistedMember(person.id)}
      onRemove={(person) => removeCommitteeMember(person.id)}
    />
  );
}
