import {
  EVENT_PLAN_LEAD_TYPES,
  EVENT_PLAN_MEMBER_ROLES,
} from "@/lib/constants";
import type { EventPlanLeadType, EventPlanMemberRole } from "@/types";

/**
 * The three titles a person can hold on an event plan, as one picker.
 *
 * `role` and `lead_type` are two columns for a good reason — every
 * authorization check reads `role` and shouldn't have to know a board lead from
 * a chair — but nobody staffing an event thinks in two questions. They think
 * "Jamie is the chair." So the UI asks once, and this is where the answer is
 * split back into the pair the database stores.
 *
 * `lead` is the fourth value and never offered: it's what a lead recorded
 * before the board/chair split still reads as, kept so their row shows what it
 * actually says instead of silently displaying as something else.
 */
export type EventPlanRoleChoice =
  | "member"
  | "board"
  | "committee_chair"
  | "lead";

export const EVENT_PLAN_ROLE_CHOICES: {
  value: Exclude<EventPlanRoleChoice, "lead">;
  label: string;
  hint: string;
}[] = [
  {
    value: "member",
    label: EVENT_PLAN_MEMBER_ROLES.member,
    hint: "Takes on tasks and joins the conversation.",
  },
  {
    value: "committee_chair",
    label: EVENT_PLAN_LEAD_TYPES.committee_chair,
    hint: "Runs the event: full edit access, and can manage members.",
  },
  {
    value: "board",
    label: EVENT_PLAN_LEAD_TYPES.board,
    hint: "The board member who owns this event on the board's behalf. One per event, and they must be on the PTA board.",
  },
];

/** The picker value for a membership (or invitation) as it stands today. */
export function eventPlanRoleChoice(
  role: EventPlanMemberRole,
  leadType: EventPlanLeadType | null
): EventPlanRoleChoice {
  if (role !== "lead") return "member";
  return leadType ?? "lead";
}

/** The `(role, leadType)` pair a picked title writes. */
export function eventPlanRoleInput(choice: EventPlanRoleChoice): {
  role: EventPlanMemberRole;
  leadType: EventPlanLeadType | null;
} {
  if (choice === "member") return { role: "member", leadType: null };
  if (choice === "lead") return { role: "lead", leadType: null };
  return { role: "lead", leadType: choice };
}

/** How a membership's title reads on a badge. */
export function eventPlanRoleLabel(
  role: EventPlanMemberRole,
  leadType: EventPlanLeadType | null
): string {
  return role === "lead" && leadType
    ? EVENT_PLAN_LEAD_TYPES[leadType]
    : EVENT_PLAN_MEMBER_ROLES[role];
}
