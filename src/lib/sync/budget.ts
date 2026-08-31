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
import { getSchoolCurrentYear } from "@/lib/school-year";
import { toDateOnly } from "@/lib/date-only";

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

/** Postgres caps a statement at 65535 bound parameters; stay well under it. */
const DB_CHUNK_SIZE = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Whether two `date` values mean the same day.
 *
 * The sheet supplies whatever the treasurer typed and the column stores the
 * canonical form, so the raw strings routinely differ for the same day. Falls
 * back to string equality when either side won't parse, which costs a needless
 * write rather than skipping a real change.
 */
function sameDay(stored: string, incoming: string): boolean {
  const a = toDateOnly(stored);
  const b = toDateOnly(incoming);
  return a && b ? a === b : stored === incoming;
}

/** Decimal columns come back as strings, so "1500" and "1500.00" are equal. */
function sameAmount(a: string | null, b: string | null): boolean {
  return Number(a ?? 0) === Number(b ?? 0);
}

/**
 * Pull one school's budget sheet into `budget_categories` / `budget_transactions`.
 *
 * Sheets first, Postgres second, and only the rows that actually differ. The
 * previous shape ran three queries per spreadsheet row — a category lookup, an
 * existing-row lookup, and a write — across a range up to 999 transactions
 * wide, every day, while a budget sheet changes a handful of rows a week. It
 * also re-read the school year inside the loop. Since Neon bills the wall clock
 * the endpoint is awake, that pattern was the single most expensive thing the
 * nightly cron did.
 */
async function syncBudgetForSchool(
  schoolId: string,
  sheetId: string,
  credentials: GoogleCredentials
): Promise<{ categories: number; transactions: number }> {
  const sheets = getSheetsClient(credentials);

  // ── Phase 1: Sheets only, no database ──────────────────────────────────────
  const [categoriesResponse, transactionsResponse] = await Promise.all([
    // Categories: columns A-B
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Categories!A2:B100",
    }),
    // Transactions: columns A-D (Date, Category, Description, Amount)
    sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Transactions!A2:D1000",
    }),
  ]);

  const categoryRows = categoriesResponse.data.values ?? [];
  const transactionRows = transactionsResponse.data.values ?? [];

  // ── Phase 2: database only, batched ────────────────────────────────────────
  const [schoolYear, existingCategories, existingTransactions] =
    await Promise.all([
      getSchoolCurrentYear(schoolId),
      db
        .select()
        .from(budgetCategories)
        .where(eq(budgetCategories.schoolId, schoolId)),
      db
        .select()
        .from(budgetTransactions)
        .where(eq(budgetTransactions.schoolId, schoolId)),
    ]);

  const categoryByRowId = new Map(
    existingCategories.map((c) => [c.sheetRowId, c] as const)
  );
  // Name → id, for resolving a transaction's category without a query each.
  const categoryIdByName = new Map(
    existingCategories.map((c) => [c.name, c.id] as const)
  );

  const categoriesToInsert: (typeof budgetCategories.$inferInsert)[] = [];
  const categoriesToUpdate: Array<{
    id: string;
    data: typeof budgetCategories.$inferInsert;
  }> = [];
  let categoriesSynced = 0;

  for (let i = 0; i < categoryRows.length; i++) {
    const [name, allocatedAmount] = categoryRows[i];
    if (!name) continue;

    const rowId = `${schoolId}-cat-${i + 2}`;
    const data = {
      schoolId,
      name: String(name),
      allocatedAmount: String(parseFloat(allocatedAmount) || 0),
      schoolYear,
      sheetRowId: rowId,
    };

    const existing = categoryByRowId.get(rowId);
    if (!existing) {
      categoriesToInsert.push(data);
    } else if (
      existing.name !== data.name ||
      !sameAmount(existing.allocatedAmount, data.allocatedAmount) ||
      existing.schoolYear !== data.schoolYear
    ) {
      categoriesToUpdate.push({ id: existing.id, data });
    }

    categoriesSynced++;
  }

  for (const rows of chunk(categoriesToInsert, DB_CHUNK_SIZE)) {
    const inserted = await db
      .insert(budgetCategories)
      .values(rows)
      .returning({ id: budgetCategories.id, name: budgetCategories.name });
    // A transaction can name a category created in this same run.
    for (const row of inserted) categoryIdByName.set(row.name, row.id);
  }

  for (const { id, data } of categoriesToUpdate) {
    await db
      .update(budgetCategories)
      .set({ ...data, lastSynced: new Date() })
      .where(eq(budgetCategories.id, id));
    categoryIdByName.set(data.name, id);
  }

  const transactionByRowId = new Map(
    existingTransactions.map((t) => [t.sheetRowId, t] as const)
  );

  const transactionsToInsert: (typeof budgetTransactions.$inferInsert)[] = [];
  const transactionsToUpdate: Array<{
    id: string;
    data: typeof budgetTransactions.$inferInsert;
  }> = [];
  let transactionsSynced = 0;

  for (let i = 0; i < transactionRows.length; i++) {
    const [date, categoryName, description, amount] = transactionRows[i];
    if (!description || !amount) continue;

    const rowId = `${schoolId}-txn-${i + 2}`;
    const data = {
      schoolId,
      categoryId: categoryIdByName.get(String(categoryName)) ?? null,
      description: String(description),
      amount: String(parseFloat(amount) || 0),
      date: String(date),
      sheetRowId: rowId,
    };

    const existing = transactionByRowId.get(rowId);
    if (!existing) {
      transactionsToInsert.push(data);
    } else if (
      existing.categoryId !== data.categoryId ||
      existing.description !== data.description ||
      !sameAmount(existing.amount, data.amount) ||
      !sameDay(existing.date, data.date)
    ) {
      transactionsToUpdate.push({ id: existing.id, data });
    }

    transactionsSynced++;
  }

  for (const rows of chunk(transactionsToInsert, DB_CHUNK_SIZE)) {
    await db.insert(budgetTransactions).values(rows);
  }

  for (const { id, data } of transactionsToUpdate) {
    await db
      .update(budgetTransactions)
      .set({ ...data, lastSynced: new Date() })
      .where(eq(budgetTransactions.id, id));
  }

  const written =
    categoriesToInsert.length +
    categoriesToUpdate.length +
    transactionsToInsert.length +
    transactionsToUpdate.length;
  if (written > 0) {
    console.log(
      `[budget-sync] school ${schoolId}: ${categoriesToInsert.length}/${categoriesToUpdate.length} categories new/changed, ${transactionsToInsert.length}/${transactionsToUpdate.length} transactions new/changed`
    );
  }

  return { categories: categoriesSynced, transactions: transactionsSynced };
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
    try {
      const result = await syncBudgetForSchool(
        config.schoolId,
        config.sheetId,
        config.credentials
      );
      totalCategoriesSynced += result.categories;
      totalTransactionsSynced += result.transactions;
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

  try {
    return await syncBudgetForSchool(
      schoolId,
      budgetIntegration.sheetId,
      credentials
    );
  } catch (error) {
    console.error(`Failed to sync budget data for school ${schoolId}:`, error);
    return { categories: 0, transactions: 0, error: "Sync failed" };
  }
}
