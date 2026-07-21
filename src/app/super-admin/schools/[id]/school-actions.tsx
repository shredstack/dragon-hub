"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateSchool,
  regenerateJoinCode,
  repairSchoolAccess,
} from "@/actions/super-admin";
import { LifeBuoy } from "lucide-react";
import type { School } from "@/types";

interface SchoolActionsProps {
  school: School;
}

export function SchoolActions({ school }: SchoolActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleToggleActive() {
    setIsLoading(true);
    try {
      await updateSchool(school.id, { active: !school.active });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update school");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegenerateCode() {
    if (
      !confirm(
        "Are you sure you want to regenerate the join code? The old code will no longer work."
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      await regenerateJoinCode(school.id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to regenerate code");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRepair() {
    if (
      !confirm(
        "Restore School Admin / PTA Board access for this school's active year?\n\n" +
          "This re-approves leadership memberships and carries them into the current " +
          "year. It does not delete anything and is safe to run on a healthy school."
      )
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const r = await repairSchoolAccess(school.id);
      alert(
        r.alreadyHealthy
          ? `No repair needed — leadership already active for ${r.currentYear}.`
          : `Repaired: ${r.restored} membership(s) restored, ${r.carried} carried into ${r.currentYear}.`
      );
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to repair access");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={handleRepair}
        disabled={isLoading}
        title="Restore board access after a bad school-year rollover"
        className="flex items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
      >
        <LifeBuoy className="h-4 w-4" />
        Repair Access
      </button>
      <button
        onClick={handleRegenerateCode}
        disabled={isLoading}
        className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        Regenerate Code
      </button>
      <button
        onClick={handleToggleActive}
        disabled={isLoading}
        className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${
          school.active
            ? "border border-red-200 text-red-600 hover:bg-red-50"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        {school.active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}
