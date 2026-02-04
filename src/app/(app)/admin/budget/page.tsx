import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { budgetCategories, budgetTransactions } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CategoryForm } from "./category-form";
import { TransactionForm } from "./transaction-form";
import { BudgetActions } from "./budget-actions";

export default async function AdminBudgetPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const categories = await db
    .select({
      id: budgetCategories.id,
      name: budgetCategories.name,
      allocatedAmount: budgetCategories.allocatedAmount,
      schoolYear: budgetCategories.schoolYear,
      sheetRowId: budgetCategories.sheetRowId,
    })
    .from(budgetCategories)
    .orderBy(budgetCategories.name);

  const transactions = await db
    .select({
      id: budgetTransactions.id,
      categoryId: budgetTransactions.categoryId,
      description: budgetTransactions.description,
      amount: budgetTransactions.amount,
      date: budgetTransactions.date,
      sheetRowId: budgetTransactions.sheetRowId,
      categoryName: budgetCategories.name,
    })
    .from(budgetTransactions)
    .leftJoin(budgetCategories, eq(budgetTransactions.categoryId, budgetCategories.id))
    .orderBy(desc(budgetTransactions.date));

  // Compute spent per category from transactions
  const spentByCategory: Record<string, number> = {};
  for (const t of transactions) {
    if (t.categoryId) {
      spentByCategory[t.categoryId] = (spentByCategory[t.categoryId] ?? 0) + Number(t.amount);
    }
  }

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Manage Budget</h1>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <div className="mb-4 flex justify-end">
            <CategoryForm />
          </div>

          {categories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
              <p className="text-muted-foreground">No budget categories yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-3">Name</th>
                      <th className="p-3">Allocated</th>
                      <th className="p-3">Spent</th>
                      <th className="p-3">Synced</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id} className="border-b border-border">
                        <td className="p-3">{cat.name}</td>
                        <td className="p-3">
                          {cat.allocatedAmount
                            ? formatCurrency(Number(cat.allocatedAmount))
                            : "—"}
                        </td>
                        <td className="p-3">
                          {formatCurrency(spentByCategory[cat.id] ?? 0)}
                        </td>
                        <td className="p-3">
                          {cat.sheetRowId ? (
                            <Badge variant="success">Synced</Badge>
                          ) : (
                            <Badge variant="secondary">Local</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <CategoryForm
                              category={{
                                id: cat.id,
                                name: cat.name,
                                allocatedAmount: cat.allocatedAmount,
                                schoolYear: cat.schoolYear,
                              }}
                            />
                            <BudgetActions id={cat.id} type="category" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions">
          <div className="mb-4 flex justify-end">
            <TransactionForm categories={categoryOptions} />
          </div>

          {transactions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
              <p className="text-muted-foreground">No transactions yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-3">Date</th>
                      <th className="p-3">Description</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Synced</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-border">
                        <td className="p-3">{formatDate(tx.date)}</td>
                        <td className="p-3">{tx.description}</td>
                        <td className="p-3">{tx.categoryName ?? "—"}</td>
                        <td className="p-3">{formatCurrency(Number(tx.amount))}</td>
                        <td className="p-3">
                          {tx.sheetRowId ? (
                            <Badge variant="success">Synced</Badge>
                          ) : (
                            <Badge variant="secondary">Local</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <TransactionForm
                              categories={categoryOptions}
                              transaction={{
                                id: tx.id,
                                categoryId: tx.categoryId,
                                description: tx.description,
                                amount: tx.amount,
                                date: tx.date,
                              }}
                            />
                            <BudgetActions id={tx.id} type="transaction" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
