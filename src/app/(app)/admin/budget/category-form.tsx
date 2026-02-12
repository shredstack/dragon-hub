"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createBudgetCategory, updateBudgetCategory } from "@/actions/budget";
import { CURRENT_SCHOOL_YEAR, SCHOOL_YEAR_OPTIONS } from "@/lib/constants";

interface CategoryFormProps {
  category?: {
    id: string;
    name: string;
    allocatedAmount: string | null;
    schoolYear: string;
  };
}

export function CategoryForm({ category }: CategoryFormProps) {
  const router = useRouter();
  const isEdit = !!category;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [allocatedAmount, setAllocatedAmount] = useState(
    category?.allocatedAmount ?? ""
  );
  const [schoolYear, setSchoolYear] = useState(
    category?.schoolYear ?? CURRENT_SCHOOL_YEAR
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isEdit) {
        await updateBudgetCategory(category.id, {
          name,
          allocatedAmount,
        });
      } else {
        await createBudgetCategory({
          name,
          allocatedAmount,
          schoolYear,
        });
      }
      setOpen(false);
      if (!isEdit) {
        setName("");
        setAllocatedAmount("");
        setSchoolYear(CURRENT_SCHOOL_YEAR);
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "ghost" : "default"} size="sm">
          {isEdit ? "Edit" : "Add Category"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Category" : "Add Category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Allocated Amount
            </label>
            <input
              type="number"
              required
              step="0.01"
              min="0"
              value={allocatedAmount}
              onChange={(e) => setAllocatedAmount(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              School Year
            </label>
            <select
              required
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {SCHOOL_YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
