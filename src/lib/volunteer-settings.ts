/**
 * `schools.volunteer_settings` — the board's configuration of the room parent
 * signup, read back with its defaults filled in.
 *
 * It lives here rather than in `actions/volunteer-signups.ts` because
 * `volunteer-onboarding.ts` needs the room parent capacity rule and cannot
 * import a "use server" module. One definition of "what is the limit, and does
 * a full room take a waitlist" keeps the signup form, the write path and the
 * admin dashboard from each answering it slightly differently.
 */

import type { SignupPageContent } from "@/lib/signup-page-content";
import type { VolunteerEligibilityInfo } from "@/lib/volunteer-eligibility";
import type { CapacityState } from "@/lib/waitlist-shared";

export interface VolunteerSettings {
  roomParentLimit: number;
  partyTypes: string[];
  enabled: boolean;
  /**
   * Whether a full classroom takes a waitlist. Missing means yes — see the
   * schema comment on `volunteerSettings`.
   */
  roomParentWaitlist?: boolean;
  /** Board-editable copy for the public sign-up page. */
  signupPage?: SignupPageContent;
  /** District volunteer-application reminder shown after every sign-up. */
  eligibility?: VolunteerEligibilityInfo;
}

export const DEFAULT_VOLUNTEER_SETTINGS: VolunteerSettings = {
  roomParentLimit: 2,
  partyTypes: ["halloween", "valentines"],
  enabled: true,
  roomParentWaitlist: true,
};

/** Settings as configured, or the defaults for a school that never touched them. */
export function resolveVolunteerSettings(
  stored: VolunteerSettings | null | undefined
): VolunteerSettings {
  return stored ?? DEFAULT_VOLUNTEER_SETTINGS;
}

/** Whether a full classroom queues the next volunteer or turns them away. */
export function roomParentWaitlistEnabled(settings: VolunteerSettings): boolean {
  return settings.roomParentWaitlist ?? true;
}

/**
 * The room parent capacity of one classroom, in the shape every waitlist
 * surface takes — the same `CapacityState` a committee produces, so the shared
 * copy helpers render both.
 */
export function roomParentCapacity(
  settings: VolunteerSettings,
  taken: number
): CapacityState {
  return {
    taken,
    limit: settings.roomParentLimit,
    waitlistEnabled: roomParentWaitlistEnabled(settings),
  };
}
