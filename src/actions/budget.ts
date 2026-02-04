"use server";

import { assertAuthenticated, assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { budgetCategories, budgetTransactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createBudgetCategory(data: {
  name: string;
  allocatedAmount: string;
  schoolYear: string;
}) {
  const user = await assertAuthenticated();
  await assertPtaBoard(user.id!);

  await db.insert(budgetCategories).values({
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
  await assertPtaBoard(user.id!);

  await db.update(budgetCategories).set(data).where(eq(budgetCategories.id, id));

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}

export async function deleteBudgetCategory(id: string) {
  const user = await assertAuthenticated();
  await assertPtaBoard(user.id!);

  await db.delete(budgetCategories).where(eq(budgetCategories.id, id));

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
  await assertPtaBoard(user.id!);

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
  await assertPtaBoard(user.id!);

  await db.update(budgetTransactions).set(data).where(eq(budgetTransactions.id, id));

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}

export async function deleteBudgetTransaction(id: string) {
  const user = await assertAuthenticated();
  await assertPtaBoard(user.id!);

  await db.delete(budgetTransactions).where(eq(budgetTransactions.id, id));

  revalidatePath("/admin/budget");
  revalidatePath("/budget");
}
