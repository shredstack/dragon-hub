"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { budgetCategories, budgetTransactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createBudgetCategory(data: {
  name: string;
  allocatedAmount: string;
  schoolYear: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db.insert(budgetCategories).values({
    schoolId,
    name: data.name,
    allocatedAmount: data.allocatedAmount,
    schoolYear: data.schoolYear,
  });

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}

export async function updateBudgetCategory(
  id: string,
  data: { name?: string; allocatedAmount?: string }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Only update category if it belongs to current school
  await db
    .update(budgetCategories)
    .set(data)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.schoolId, schoolId)));

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}

export async function deleteBudgetCategory(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Only delete category if it belongs to current school
  await db
    .delete(budgetCategories)
    .where(and(eq(budgetCategories.id, id), eq(budgetCategories.schoolId, schoolId)));

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}

export async function createBudgetTransaction(data: {
  categoryId: string;
  description: string;
  amount: string;
  date: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the category belongs to current school
  const category = await db.query.budgetCategories.findFirst({
    where: and(eq(budgetCategories.id, data.categoryId), eq(budgetCategories.schoolId, schoolId)),
  });
  if (!category) throw new Error("Budget category not found");

  await db.insert(budgetTransactions).values({
    categoryId: data.categoryId,
    description: data.description,
    amount: data.amount,
    date: data.date,
  });

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}

export async function updateBudgetTransaction(
  id: string,
  data: { categoryId?: string; description?: string; amount?: string; date?: string }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the transaction's category belongs to current school
  const transaction = await db.query.budgetTransactions.findFirst({
    where: eq(budgetTransactions.id, id),
    with: { category: true },
  });
  if (!transaction || transaction.category?.schoolId !== schoolId) {
    throw new Error("Budget transaction not found");
  }

  // If changing category, verify new category belongs to current school
  if (data.categoryId) {
    const newCategory = await db.query.budgetCategories.findFirst({
      where: and(eq(budgetCategories.id, data.categoryId), eq(budgetCategories.schoolId, schoolId)),
    });
    if (!newCategory) throw new Error("Budget category not found");
  }

  await db.update(budgetTransactions).set(data).where(eq(budgetTransactions.id, id));

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}

export async function deleteBudgetTransaction(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the transaction's category belongs to current school
  const transaction = await db.query.budgetTransactions.findFirst({
    where: eq(budgetTransactions.id, id),
    with: { category: true },
  });
  if (!transaction || transaction.category?.schoolId !== schoolId) {
    throw new Error("Budget transaction not found");
  }

  await db.delete(budgetTransactions).where(eq(budgetTransactions.id, id));

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}
