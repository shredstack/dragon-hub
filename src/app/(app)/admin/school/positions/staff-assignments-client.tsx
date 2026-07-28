"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setMemberAdminPosition,
  type AssignableStaffMember,
  type SchoolAdminPositionWithUsage,
} from "@/actions/school-admin";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { UserCog } from "lucide-react";

/** Radix rejects an empty-string item value, so "unassigned" needs a name. */
const NO_POSITION = "__none__";

interface Props {
  staff: AssignableStaffMember[];
  positions: SchoolAdminPositionWithUsage[];
}

/**
 * Who holds each position.
 *
 * Lives on the positions page rather than in the directory because the two
 * halves are one job: a school names the position it fills, then says who fills
 * it. The list is only the people who already hold staff access — this screen
 * hands out titles, not access, and access is the staff code's job.
 */
export function StaffAssignmentsClient({ staff, positions }: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const activePositions = positions.filter((p) => p.active);

  async function handleChange(member: AssignableStaffMember, value: string) {
    const slug = value === NO_POSITION ? null : value;
    if (slug === member.positionSlug) return;

    setBusyId(member.membershipId);
    try {
      await setMemberAdminPosition(member.membershipId, slug);
      const label = slug
        ? positions.find((p) => p.slug === slug)?.label ?? "position"
        : null;
      addToast(
        label
          ? `${member.name ?? member.email} is now ${label}`
          : `Cleared ${member.name ?? member.email}'s position`,
        "success"
      );
      startTransition(() => router.refresh());
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Something went wrong",
        "destructive"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Who holds each position</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Everyone with school administrator access. To add someone to this
          list, send them a code from Staff Access Codes and approve them —
          giving a title here doesn&apos;t grant access on its own.
        </p>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No school administrators yet"
          description="Once someone redeems a staff access code and you approve them, they'll show up here to be given a position."
        />
      ) : (
        <div className="space-y-2">
          {staff.map((member) => {
            const isBusy = busyId === member.membershipId || isPending;
            // A position turned off after it was assigned still has to appear,
            // or the picker would silently show the wrong person's title.
            const retired =
              member.positionSlug &&
              !activePositions.some((p) => p.slug === member.positionSlug)
                ? positions.find((p) => p.slug === member.positionSlug)
                : null;

            return (
              <div
                key={member.membershipId}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{member.name ?? member.email}</p>
                    {member.alsoOnBoard && (
                      <span className="rounded-full bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-200">
                        Also on PTA Board
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {member.email}
                  </p>
                </div>

                <div className="shrink-0 sm:w-64">
                  <Select
                    value={member.positionSlug ?? NO_POSITION}
                    onValueChange={(value) => handleChange(member, value)}
                    disabled={isBusy}
                  >
                    <SelectTrigger
                      aria-label={`Position for ${member.name ?? member.email}`}
                    >
                      <SelectValue placeholder="No position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_POSITION}>No position</SelectItem>
                      {activePositions.map((position) => (
                        <SelectItem key={position.slug} value={position.slug}>
                          {position.label}
                        </SelectItem>
                      ))}
                      {retired && (
                        <SelectItem value={retired.slug}>
                          {retired.label} (turned off)
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
