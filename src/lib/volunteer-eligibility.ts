/**
 * The district volunteer-eligibility reminder shown to every new volunteer.
 *
 * Districts require volunteers to renew a background check / volunteer
 * application once per school year before they're allowed on campus, and that
 * step happens on the district's site — not here. New volunteers are the ones
 * most likely not to know, so the reminder rides along with every sign-up
 * confirmation screen and welcome email.
 *
 * Stored on schools.volunteer_settings (alongside SignupPageContent) so the PTA
 * Board can point it at their own district without a deploy. Dependency-free so
 * the admin editor's live preview and the email builder can share it.
 *
 * The URL rules and the open-mode choice come from `@/lib/links-shared`, which
 * is the one place those are defined for every board-entered link in the app.
 */

import {
  normalizeLinkUrl,
  parseLinkOpenMode,
  type LinkOpenMode,
} from "@/lib/links-shared";
export interface VolunteerEligibilityInfo {
  /** District application URL. Empty string means "not configured" — nothing renders. */
  url: string;
  /** Link text, e.g. "Alpine District Volunteer Application". */
  linkLabel: string;
  /** Sentence explaining the annual requirement. Plain text. */
  note: string;
  /** Optional plain-text deadline, e.g. "Renew by September 15". Empty = omit. */
  deadline: string;
  /**
   * How the link opens on screen — see src/lib/links-shared.ts. Defaults to
   * `new_tab`, which is also what schools configured before this existed get.
   *
   * Email ignores it entirely: there is no in-app anything in an inbox, so the
   * welcome email always renders a plain link.
   */
  openMode: LinkOpenMode;
}

export const DEFAULT_VOLUNTEER_ELIGIBILITY: VolunteerEligibilityInfo = {
  url: "",
  linkLabel: "Renew your district volunteer application",
  note:
    "Before you can volunteer at the school, the district requires every volunteer to complete their volunteer application once each school year. It only takes a few minutes, and it has to be renewed even if you did it last year.",
  deadline: "",
  openMode: "new_tab",
};

export function withVolunteerEligibilityDefaults(
  stored: Partial<VolunteerEligibilityInfo> | null | undefined
): VolunteerEligibilityInfo {
  return {
    url: stored?.url ?? DEFAULT_VOLUNTEER_ELIGIBILITY.url,
    linkLabel: stored?.linkLabel || DEFAULT_VOLUNTEER_ELIGIBILITY.linkLabel,
    note: stored?.note ?? DEFAULT_VOLUNTEER_ELIGIBILITY.note,
    deadline: stored?.deadline ?? DEFAULT_VOLUNTEER_ELIGIBILITY.deadline,
    openMode: parseLinkOpenMode(stored?.openMode),
  };
}

/**
 * Only http(s) links are allowed through. The URL is board-entered and ends up
 * in an `href` on a public page and inside email HTML, so anything else
 * (`javascript:`, `data:`) has to be rejected rather than rendered.
 */
export function isSafeEligibilityUrl(url: string): boolean {
  return normalizeLinkUrl(url) !== null;
}

/**
 * Board members paste "district.org/volunteer" as often as they paste a full
 * URL, so assume https when no scheme is given rather than rejecting it.
 *
 * Something unusable is handed back as typed rather than blanked, so the caller
 * can tell "they left it empty" (turn the reminder off) apart from "they made a
 * typo" (say so) — `isSafeEligibilityUrl` is what rejects it.
 */
export function normalizeEligibilityUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return normalizeLinkUrl(trimmed) ?? trimmed;
}

/**
 * The reminder as it should be displayed, or null when the school hasn't
 * configured a usable link — every surface hides the whole block in that case
 * rather than showing a renewal notice with nowhere to go.
 */
export function resolveVolunteerEligibility(
  stored: Partial<VolunteerEligibilityInfo> | null | undefined
): VolunteerEligibilityInfo | null {
  const info = withVolunteerEligibilityDefaults(stored);
  if (!info.url || !isSafeEligibilityUrl(info.url)) return null;
  return info;
}
