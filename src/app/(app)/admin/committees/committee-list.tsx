"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCommittee } from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import {
  CommitteeForm,
  EMPTY_COMMITTEE,
  toCommitteeInput,
  type CommitteeFormValue,
} from "./committee-form";
import type { CapacityMode, CommitteeStatus } from "@/actions/committees";

interface CommitteeRow {
  id: string;
  name: string;
  iconEmoji: string | null;
  scopeLabel: string;
  status: CommitteeStatus;
  capacityMode: CapacityMode;
  minSize: number | null;
  maxSize: number | null;
  memberCount: number;
  waitlistCount: number;
  stillNeeded: number;
  chairNames: string[];
  showOnRoomParentSignup: boolean;
  archivedAt: Date | null;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "secondary"> = {
  draft: "secondary",
  active: "success",
  closed: "default",
};

export function CommitteeList({ committees }: { committees: CommitteeRow[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [value, setValue] = useState<CommitteeFormValue>(EMPTY_COMMITTEE);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    try {
      const committee = await createCommittee(toCommitteeInput(value));
      router.push(`/admin/committees/${committee.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't create the committee."
      );
    }
  };

  const openCreate = () => {
    setValue(EMPTY_COMMITTEE);
    setError(null);
    setIsCreating(true);
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate}>New Committee</Button>
      </div>

      {committees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No committees yet"
          description="Create one for the school year, then hand out its join link or QR code. Anyone who signs up joins immediately — no admin step."
        >
          <Button className="mt-4" onClick={openCreate}>
            Create your first committee
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {committees.map((c) => (
              <Link
                key={c.id}
                href={`/admin/committees/${c.id}`}
                className="block rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.iconEmoji && <span className="mr-1">{c.iconEmoji}</span>}
                      {c.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{c.scopeLabel}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[c.status] ?? "default"}>
                    {c.status}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  <Fill committee={c} />
                  {c.chairNames.length > 0 && ` · Chair: ${c.chairNames.join(", ")}`}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <StatusBadges committee={c} />
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Committee</th>
                    <th className="px-4 py-3 font-medium">Scope</th>
                    <th className="px-4 py-3 font-medium">Members</th>
                    <th className="px-4 py-3 font-medium">Chair</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {committees.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/committees/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.iconEmoji && (
                            <span className="mr-1">{c.iconEmoji}</span>
                          )}
                          {c.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <StatusBadges committee={c} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.scopeLabel}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <Fill committee={c} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.chairNames.length > 0 ? c.chairNames.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[c.status] ?? "default"}>
                          {c.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <CommitteeForm
        open={isCreating}
        onOpenChange={setIsCreating}
        title="New Committee"
        value={value}
        onChange={(next) => setValue((prev) => ({ ...prev, ...next }))}
        onSubmit={handleCreate}
        submitLabel="Create committee"
        error={error}
      />
    </>
  );
}

function Fill({ committee }: { committee: CommitteeRow }) {
  if (committee.capacityMode === "capped" && committee.maxSize !== null) {
    return (
      <>
        {committee.memberCount} of {committee.maxSize}
      </>
    );
  }
  return (
    <>
      {committee.memberCount} member{committee.memberCount === 1 ? "" : "s"}
    </>
  );
}

/**
 * The under-staffed flag is the single most useful thing on this page in
 * September, so it leads.
 */
function StatusBadges({ committee }: { committee: CommitteeRow }) {
  return (
    <>
      {committee.stillNeeded > 0 && (
        <Badge variant="warning">Needs {committee.stillNeeded} more</Badge>
      )}
      {committee.waitlistCount > 0 && (
        <Badge variant="secondary">{committee.waitlistCount} waiting</Badge>
      )}
      {committee.showOnRoomParentSignup && (
        <Badge variant="outline">On room parent sign-up</Badge>
      )}
      {committee.archivedAt && <Badge variant="secondary">Archived</Badge>}
    </>
  );
}
