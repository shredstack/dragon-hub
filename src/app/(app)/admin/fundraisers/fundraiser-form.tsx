"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createFundraiser, updateFundraiser } from "@/actions/fundraisers";

interface FundraiserFormProps {
  fundraiser?: {
    id: string;
    name: string;
    goalAmount: string | null;
    startDate: string | null;
    endDate: string | null;
    active: boolean | null;
  };
}

export function FundraiserForm({ fundraiser }: FundraiserFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = !!fundraiser;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const goalAmount = formData.get("goalAmount") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;

    try {
      if (isEdit) {
        const active = formData.get("active") === "on";
        await updateFundraiser(fundraiser.id, {
          name,
          goalAmount: goalAmount || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          active,
        });
      } else {
        await createFundraiser({
          name,
          goalAmount: goalAmount || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });
      }
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const inputClassName =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "ghost" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "Create Fundraiser"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Fundraiser" : "Create Fundraiser"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              name="name"
              required
              defaultValue={fundraiser?.name ?? ""}
              className={inputClassName}
              placeholder="Spring Fundraiser"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Goal Amount
            </label>
            <input
              name="goalAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={fundraiser?.goalAmount ?? ""}
              className={inputClassName}
              placeholder="5000.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Start Date
              </label>
              <input
                name="startDate"
                type="date"
                defaultValue={fundraiser?.startDate ?? ""}
                className={inputClassName}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                End Date
              </label>
              <input
                name="endDate"
                type="date"
                defaultValue={fundraiser?.endDate ?? ""}
                className={inputClassName}
              />
            </div>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                name="active"
                type="checkbox"
                id="active"
                defaultChecked={fundraiser?.active ?? true}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="active" className="text-sm font-medium">
                Active
              </label>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Create Fundraiser"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
