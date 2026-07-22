"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete this ${type}?`,
      description:
        type === "category"
          ? "The category and every transaction filed under it are removed from the budget."
          : "The transaction is removed from the budget. The category it belonged to stays.",
      confirmLabel: `Delete ${type}`,
    });
    if (!ok) return;

    try {
      if (type === "category") {
        await deleteBudgetCategory(id);
      } else {
        await deleteBudgetTransaction(id);
      }
      router.refresh();
    } finally {
      closeConfirm();
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={handleDelete}>
        Delete
      </Button>
      {confirmDialog}
    </>
  );
}
