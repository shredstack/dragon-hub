import {
  getSheetsClient,
  getSchoolGoogleCredentials,
  GoogleCredentials,
} from "@/lib/google";
import { db } from "@/lib/db";
import {
  budgetCategories,
  budgetTransactions,
  schoolBudgetIntegrations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

interface SchoolBudgetConfig {
  schoolId: string;
  sheetId: string;
  credentials: GoogleCredentials;
}

async function getSchoolBudgetConfigs(): Promise<SchoolBudgetConfig[]> {
  const results: SchoolBudgetConfig[] = [];

  // Get all active schools with budget integrations
  const budgetIntegrations = await db.query.schoolBudgetIntegrations.findMany({
    where: eq(schoolBudgetIntegrations.active, true),
  });

  for (const integration of budgetIntegrations) {
    // Get Google credentials for this school
    const credentials = await getSchoolGoogleCredentials(integration.schoolId);
    if (!credentials) {
      // School doesn't have Google credentials configured, skip
      console.log(
        `School ${integration.schoolId} has budget integration but no Google credentials, skipping`
      );
      continue;
    }

    results.push({
      schoolId: integration.schoolId,
      sheetId: integration.sheetId,
      credentials,
    });
  }

  return results;
}

export async function syncBudgetData() {
  const schoolConfigs = await getSchoolBudgetConfigs();

  if (schoolConfigs.length === 0) {
    console.log(
      "No schools with Google credentials and budget integrations configured, skipping sync"
    );
    return { categories: 0, transactions: 0, schoolsProcessed: 0 };
  }

  let totalCategoriesSynced = 0;
  let totalTransactionsSynced = 0;
  let schoolsProcessed = 0;

  for (const config of schoolConfigs) {
    const sheets = getSheetsClient(config.credentials);

    try {
      // Fetch budget categories (Sheet: "Categories", columns A-B)
      const categoriesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetId,
        range: "Categories!A2:B100",
      });

      const categoryRows = categoriesResponse.data.values ?? [];

      for (let i = 0; i < categoryRows.length; i++) {
        const [name, allocatedAmount] = categoryRows[i];
        if (!name) continue;

        const rowId = `${config.schoolId}-cat-${i + 2}`;
        const existing = await db.query.budgetCategories.findFirst({
          where: and(
            eq(budgetCategories.sheetRowId, rowId),
            eq(budgetCategories.schoolId, config.schoolId)
          ),
        });

        const data = {
          schoolId: config.schoolId,
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

        totalCategoriesSynced++;
      }

      // Fetch transactions (Sheet: "Transactions", columns A-D: Date, Category, Description, Amount)
      const transactionsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.sheetId,
        range: "Transactions!A2:D1000",
      });

      const transactionRows = transactionsResponse.data.values ?? [];

      for (let i = 0; i < transactionRows.length; i++) {
        const [date, categoryName, description, amount] = transactionRows[i];
        if (!description || !amount) continue;

        const rowId = `${config.schoolId}-txn-${i + 2}`;

        // Find matching category for this school
        const category = await db.query.budgetCategories.findFirst({
          where: and(
            eq(budgetCategories.name, String(categoryName)),
            eq(budgetCategories.schoolId, config.schoolId)
          ),
        });

        const existing = await db.query.budgetTransactions.findFirst({
          where: and(
            eq(budgetTransactions.sheetRowId, rowId),
            eq(budgetTransactions.schoolId, config.schoolId)
          ),
        });

        const data = {
          schoolId: config.schoolId,
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

        totalTransactionsSynced++;
      }

      schoolsProcessed++;
    } catch (error) {
      console.error(
        `Failed to sync budget data for school ${config.schoolId}:`,
        error
      );
    }
  }

  return {
    categories: totalCategoriesSynced,
    transactions: totalTransactionsSynced,
    schoolsProcessed,
  };
}

export async function syncSchoolBudget(schoolId: string) {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return { categories: 0, transactions: 0, error: "No Google credentials configured" };
  }

  const budgetIntegration = await db.query.schoolBudgetIntegrations.findFirst({
    where: and(
      eq(schoolBudgetIntegrations.schoolId, schoolId),
      eq(schoolBudgetIntegrations.active, true)
    ),
  });

  if (!budgetIntegration) {
    return { categories: 0, transactions: 0, error: "No active budget integration configured" };
  }

  const sheets = getSheetsClient(credentials);
  let categoriesSynced = 0;
  let transactionsSynced = 0;

  try {
    // Fetch budget categories (Sheet: "Categories", columns A-B)
    const categoriesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: budgetIntegration.sheetId,
      range: "Categories!A2:B100",
    });

    const categoryRows = categoriesResponse.data.values ?? [];

    for (let i = 0; i < categoryRows.length; i++) {
      const [name, allocatedAmount] = categoryRows[i];
      if (!name) continue;

      const rowId = `${schoolId}-cat-${i + 2}`;
      const existing = await db.query.budgetCategories.findFirst({
        where: and(
          eq(budgetCategories.sheetRowId, rowId),
          eq(budgetCategories.schoolId, schoolId)
        ),
      });

      const data = {
        schoolId: schoolId,
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
      spreadsheetId: budgetIntegration.sheetId,
      range: "Transactions!A2:D1000",
    });

    const transactionRows = transactionsResponse.data.values ?? [];

    for (let i = 0; i < transactionRows.length; i++) {
      const [date, categoryName, description, amount] = transactionRows[i];
      if (!description || !amount) continue;

      const rowId = `${schoolId}-txn-${i + 2}`;

      // Find matching category for this school
      const category = await db.query.budgetCategories.findFirst({
        where: and(
          eq(budgetCategories.name, String(categoryName)),
          eq(budgetCategories.schoolId, schoolId)
        ),
      });

      const existing = await db.query.budgetTransactions.findFirst({
        where: and(
          eq(budgetTransactions.sheetRowId, rowId),
          eq(budgetTransactions.schoolId, schoolId)
        ),
      });

      const data = {
        schoolId: schoolId,
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
    console.error(`Failed to sync budget data for school ${schoolId}:`, error);
    return { categories: categoriesSynced, transactions: transactionsSynced, error: "Sync failed" };
  }

  return { categories: categoriesSynced, transactions: transactionsSynced };
}
