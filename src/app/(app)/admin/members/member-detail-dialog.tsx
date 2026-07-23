"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatPhoneNumber } from "@/lib/utils";
import {
  getMemberActivity,
  type MemberActivity,
} from "@/actions/pending-members";
import { ResendInviteButton } from "./resend-invite-button";

interface MemberDetailDialogProps {
  /** Email of the member to inspect, or null when the dialog is closed. */
  email: string | null;
  /** Name for the header, when we have it. */
  name?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Drill-down for one person in the directory: exactly what they signed up for
 * across room parent / party volunteer / campaign / committee, keyed on email so
 * it works whether or not they've verified their account.
 */
export function MemberDetailDialog({
  email,
  name,
  open,
  onOpenChange,
}: MemberDetailDialogProps) {
  const [activity, setActivity] = useState<MemberActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !email) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActivity(null);
    getMemberActivity(email)
      .then((data) => {
        if (!cancelled) setActivity(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this member's activity.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, email]);

  const displayName = activity?.name ?? name ?? email ?? "Member";
  const hasAnything =
    activity &&
    (activity.classroomSignups.length > 0 ||
      activity.campaigns.length > 0 ||
      activity.committees.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {displayName}
            {activity &&
              (activity.verified ? (
                <Badge variant="secondary">✅ Verified</Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  ⚠️ Not verified
                </Badge>
              ))}
          </DialogTitle>
          <DialogDescription>
            {email}
            {activity?.phone ? ` · ${formatPhoneNumber(activity.phone)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        )}

        {error && <p className="py-6 text-sm text-red-600">{error}</p>}

        {activity && !loading && (
          <div className="space-y-5">
            {!activity.verified && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p>
                  This person signed up but hasn&apos;t confirmed their email, so
                  they can&apos;t log in yet. Their contact info is still yours to
                  use — resend their link to get them into DragonHub.
                </p>
                <div className="mt-3">
                  <ResendInviteButton email={activity.email} variant="block" />
                </div>
              </div>
            )}

            {!hasAnything && (
              <p className="text-sm text-muted-foreground">
                No active signups found for the current school year.
              </p>
            )}

            {activity.classroomSignups.length > 0 && (
              <Section title="Classrooms">
                {activity.classroomSignups.map((s, i) => (
                  <div
                    key={`${s.classroom}-${s.role}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <span className="font-medium">{s.classroom}</span>
                    <Badge variant="secondary">
                      {s.role === "room_parent" ? "Room Parent" : "Party Volunteer"}
                    </Badge>
                    {s.partyTypes.map((p) => (
                      <Badge key={p} variant="outline" className="capitalize">
                        {p}
                      </Badge>
                    ))}
                  </div>
                ))}
              </Section>
            )}

            {activity.campaigns.length > 0 && (
              <Section title="Campaign interest">
                {activity.campaigns.map((c, i) => (
                  <div
                    key={`${c.campaign}-${c.event}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{c.event}</span>
                      <span className="ml-1 text-sm text-muted-foreground">
                        · {c.campaign}
                      </span>
                    </div>
                    <Badge
                      variant={c.interestLevel === "lead" ? "default" : "secondary"}
                    >
                      {c.interestLevel === "lead" ? "Willing to lead" : "Interested"}
                    </Badge>
                  </div>
                ))}
              </Section>
            )}

            {activity.committees.length > 0 && (
              <Section title="Committees">
                {activity.committees.map((c, i) => (
                  <div
                    key={`${c.committee}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <span className="font-medium">{c.committee}</span>
                    {c.waitlisted && <Badge variant="outline">Waitlisted</Badge>}
                    {c.willingToChair && (
                      <Badge variant="secondary">Willing to chair</Badge>
                    )}
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
