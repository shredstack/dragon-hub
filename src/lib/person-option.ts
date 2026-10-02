import type { SchoolRole } from "@/types";

/**
 * Someone the board can pick instead of retyping: an approved member, or a
 * signup who hasn't confirmed their email yet (`pending`, no account). Client
 * safe — `PersonPicker` renders it and `searchSchoolPeople` returns it.
 *
 * Contact details only. Student names are board-only data and a picker has no
 * reason to carry them.
 */
export interface PersonOption {
  userId: string | null;
  /** This year's school membership, when there is one — what a role change edits. */
  membershipId: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  role: SchoolRole | null;
  boardPosition: string | null;
  pending: boolean;
}
