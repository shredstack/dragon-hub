/**
 * The activity picker on the volunteer-hours form.
 *
 * "Event name" used to be a free text box, which meant the Fall Festival got
 * logged six different ways and nothing could be totalled by event. The picker
 * offers what the school has already configured — the recurring event catalog,
 * the classrooms you're a room parent for, your committees — plus the two
 * things board members log constantly that live nowhere in the schema, and an
 * "Other" escape hatch for the one-off nobody set up in advance.
 *
 * What gets stored is still the *label*, in `volunteer_hours.event_name`: this
 * is a spelling fix, not a foreign key. A logged hour stays readable after the
 * catalog entry is renamed or the committee is archived, which is the property
 * that matters for a record someone approves months later.
 *
 * Client-safe — the submit form and the server action that builds the options
 * share these rules.
 */

import { VOLUNTEER_CATEGORIES } from "@/lib/constants";
import { isCategoryOf } from "@/lib/categories";

/** Sentinel for the free-text escape hatch. Never stored. */
export const OTHER_ACTIVITY_VALUE = "__other__";

export interface VolunteerActivityOption {
  /** Stored verbatim in `volunteer_hours.event_name`. */
  value: string;
  label: string;
  /**
   * Pre-selects the Category dropdown. Only a suggestion — every option's
   * category stays editable, because the same event can be fundraising for one
   * volunteer and classroom support for the next.
   */
  suggestedCategory: string;
}

export interface VolunteerActivityOptions {
  /** Active `event_catalog` entries for the school. */
  events: VolunteerActivityOption[];
  /** Classrooms the caller is a room parent for, this school year. */
  classrooms: VolunteerActivityOption[];
  /** The caller's committees. `id` is what `?committeeId=` prefills against. */
  committees: Array<VolunteerActivityOption & { id: string }>;
}

export const EMPTY_ACTIVITY_OPTIONS: VolunteerActivityOptions = {
  events: [],
  classrooms: [],
  committees: [],
};

/**
 * Board work that is real volunteer time but will never be a catalog entry —
 * it has no date, no signup sheet and no plan. Offered to everyone rather than
 * to board members only: a parent who spends an evening at the PTA meeting is
 * logging the same thing a board member is.
 */
export const DEFAULT_ACTIVITIES: VolunteerActivityOption[] = [
  {
    value: "General PTA Board Tasks",
    label: "General PTA Board Tasks",
    suggestedCategory: "pta_business",
  },
  {
    value: "PTA Meeting",
    label: "PTA Meeting",
    suggestedCategory: "pta_business",
  },
];

/**
 * EVENT_CATEGORIES answers "what happens at this event?", VOLUNTEER_CATEGORIES
 * answers "what kind of work was this?" — different questions, so only the few
 * that genuinely imply an answer are mapped. Everything else is event help.
 */
const EVENT_CATEGORY_TO_VOLUNTEER_CATEGORY: Record<string, string> = {
  fundraiser: "fundraising",
  party: "classroom_support",
  meeting: "pta_business",
};

const DEFAULT_EVENT_CATEGORY = "event_help";

export function suggestedCategoryForEventCategory(
  category: string | null | undefined
): string {
  if (!category) return DEFAULT_EVENT_CATEGORY;
  return (
    EVENT_CATEGORY_TO_VOLUNTEER_CATEGORY[category] ?? DEFAULT_EVENT_CATEGORY
  );
}

/** Room parents work in a classroom, whatever the occasion. */
export const ROOM_PARENT_CATEGORY = "classroom_support";

/** Most committees exist to run an event; the rest can change it. */
export const COMMITTEE_CATEGORY = "event_help";

export function roomParentActivityLabel(classroomName: string): string {
  return `Room Parent — ${classroomName}`;
}

/** Guards the suggestion against a category that isn't offered. */
export function isKnownVolunteerCategory(category: string): boolean {
  return isCategoryOf(VOLUNTEER_CATEGORIES, category);
}
