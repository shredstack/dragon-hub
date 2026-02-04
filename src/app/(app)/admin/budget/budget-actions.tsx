"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  deleteBudgetCategory,
  deleteBudgetTransaction,
} from "@/actions/budget";

interface BudgetActionsProps {
  id: string;
  type: "category" | "transaction";
}

export function BudgetActions({ id, type }: BudgetActionsProps) {
  const router = useRouter();

  async function handleDelete() {
    const confirmed = window.confirm(
      `Are you sure you want to delete this ${type}?`
    );
    if (!confirmed) return;

    if (type === "category") {
      await deleteBudgetCategory(id);
    } else {
      await deleteBudgetTransaction(id);
    }

    router.refresh();
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete}>
      Delete
    </Button>
  );
}
