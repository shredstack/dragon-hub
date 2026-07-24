import { ArrowUpRight, ExternalLink, ShieldAlert } from "lucide-react";
import { SmartLink } from "@/components/ui/smart-link";
import type { VolunteerEligibilityInfo } from "@/lib/volunteer-eligibility";

/**
 * The "renew your district volunteer application" reminder shown on every
 * sign-up confirmation screen. Rendered from client forms, so it stays
 * presentational — callers pass already-resolved info (null when the school
 * hasn't configured a link) rather than this component fetching anything.
 *
 * The board chooses whether the district's site opens in a new tab or in a
 * window over the confirmation screen; in-app keeps a parent who just signed up
 * on the page that's still telling them what happens next.
 */
export function EligibilityNotice({
  eligibility,
}: {
  eligibility: VolunteerEligibilityInfo | null;
}) {
  if (!eligibility) return null;

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            One more step before you can volunteer
          </p>
          <p className="text-sm text-amber-900">{eligibility.note}</p>
          {eligibility.deadline && (
            <p className="text-sm font-medium text-amber-900">
              {eligibility.deadline}
            </p>
          )}
          <SmartLink
            url={eligibility.url}
            openMode={eligibility.openMode}
            title={eligibility.linkLabel}
            iconEmoji="🛡️"
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            {eligibility.linkLabel}
            {eligibility.openMode === "in_app" ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" />
            )}
          </SmartLink>
        </div>
      </div>
    </div>
  );
}
