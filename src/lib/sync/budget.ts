import { getSheetsClient } from "@/lib/google";
import { db } from "@/lib/db";
import { budgetCategories, budgetTransactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

export async function syncBudgetData() {
  const sheetId = process.env.BUDGET_SHEET_ID;

  if (!sheetId) {
    console.log("No budget sheet ID configured, skipping sync");
    return { categories: 0, transactions: 0 };
  }

  const sheets = getSheetsClient();
  let categoriesSynced = 0;
  let transactionsSynced = 0;

  try {
    // Fetch budget categories (Sheet: "Categories", columns A-B)
    const categoriesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Categories!A2:B100",
    });

    const categoryRows = categoriesResponse.data.values ?? [];

    for (let i = 0; i < categoryRows.length; i++) {
      const [name, allocatedAmount] = categoryRows[i];
      if (!name) continue;

      const rowId = `cat-${i + 2}`;
      const existing = await db.query.budgetCategories.findFirst({
        where: eq(budgetCategories.sheetRowId, rowId),
      });

      const data = {
        name: String(name),
        allocatedAmount: String(parseFloat(allocatedAmount) || 0),
        schoolYear: CURRENT_SCHOOL_YEAR,
        sheetRowId: rowId,
        lastSynced: new Date(),
      };

      if (existing) {
        await db
          .update(budgetCategories)
          .set(data)
          .where(eq(budgetCategories.id, existing.id));
      } else {
        await db.insert(budgetCategories).values(data);
      }

      categoriesSynced++;
    }

    // Fetch transactions (Sheet: "Transactions", columns A-D: Date, Category, Description, Amount)
    const transactionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Transactions!A2:D1000",
    });

    const transactionRows = transactionsResponse.data.values ?? [];

    for (let i = 0; i < transactionRows.length; i++) {
      const [date, categoryName, description, amount] = transactionRows[i];
      if (!description || !amount) continue;

      const rowId = `txn-${i + 2}`;

      // Find matching category
      const category = await db.query.budgetCategories.findFirst({
        where: eq(budgetCategories.name, String(categoryName)),
      });

      const existing = await db.query.budgetTransactions.findFirst({
        where: eq(budgetTransactions.sheetRowId, rowId),
      });

      const data = {
        categoryId: category?.id ?? null,
        description: String(description),
        amount: String(parseFloat(amount) || 0),
        date: String(date),
        sheetRowId: rowId,
        lastSynced: new Date(),
      };

      if (existing) {
        await db
          .update(budgetTransactions)
          .set(data)
          .where(eq(budgetTransactions.id, existing.id));
      } else {
        await db.insert(budgetTransactions).values(data);
      }

      transactionsSynced++;
    }
  } catch (error) {
    console.error("Failed to sync budget data:", error);
    throw error;
  }

  return { categories: categoriesSynced, transactions: transactionsSynced };
}
