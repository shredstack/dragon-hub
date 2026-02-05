"use client";

import { useState } from "react";
import { renewMyMembership } from "@/actions/school-year";
import { useRouter } from "next/navigation";

interface RenewalFormProps {
  currentSchoolYear: string;
  nextSchoolYear: string;
}

export function RenewalForm({ currentSchoolYear, nextSchoolYear }: RenewalFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRenew = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await renewMyMembership();
      if (result.alreadyRenewed) {
        router.refresh();
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to renew membership");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6 rounded-lg bg-muted/50 p-4">
        <h3 className="font-medium">School Year Transition</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The {currentSchoolYear} school year is ending. Renew your membership to continue participating in {nextSchoolYear}.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div>
            <p className="text-sm text-muted-foreground">Current Membership</p>
            <p className="font-medium">{currentSchoolYear}</p>
          </div>
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            Active
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-4">
          <div>
            <p className="text-sm text-muted-foreground">New Membership</p>
            <p className="font-medium">{nextSchoolYear}</p>
          </div>
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-700">
            Pending Renewal
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        <button
          onClick={handleRenew}
          disabled={loading}
          className="w-full rounded-md bg-dragon-blue-500 px-4 py-3 font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
        >
          {loading ? "Renewing..." : `Renew for ${nextSchoolYear}`}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          By renewing, you confirm your continued participation in the PTA.
        </p>
      </div>
    </div>
  );
}
