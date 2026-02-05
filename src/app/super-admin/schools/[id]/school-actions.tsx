"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSchool, regenerateJoinCode } from "@/actions/super-admin";
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

  return (
    <div className="flex gap-2">
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
