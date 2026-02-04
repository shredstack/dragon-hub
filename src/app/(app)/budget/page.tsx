import { db } from "@/lib/db";
import { budgetCategories, budgetTransactions } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { formatCurrency, formatDate } from "@/lib/utils";
import { BudgetCharts } from "@/components/budget/budget-charts";
import { ProgressBar } from "@/components/ui/progress-bar";

export default async function BudgetPage() {
  const categories = await db
    .select({
      id: budgetCategories.id,
      name: budgetCategories.name,
      allocatedAmount: budgetCategories.allocatedAmount,
      totalSpent: sql<string>`coalesce(sum(abs(${budgetTransactions.amount})), 0)`,
    })
    .from(budgetCategories)
    .leftJoin(budgetTransactions, eq(budgetCategories.id, budgetTransactions.categoryId))
    .groupBy(budgetCategories.id);

  const recentTransactions = await db
    .select({
      id: budgetTransactions.id,
      description: budgetTransactions.description,
      amount: budgetTransactions.amount,
      date: budgetTransactions.date,
      categoryName: budgetCategories.name,
    })
    .from(budgetTransactions)
    .leftJoin(budgetCategories, eq(budgetTransactions.categoryId, budgetCategories.id))
    .orderBy(desc(budgetTransactions.date))
    .limit(20);

  const totalBudget = categories.reduce((sum, c) => sum + parseFloat(c.allocatedAmount ?? "0"), 0);
  const totalSpent = categories.reduce((sum, c) => sum + parseFloat(c.totalSpent), 0);
  const remaining = totalBudget - totalSpent;

  const chartData = categories.map((c) => ({
    name: c.name,
    allocated: parseFloat(c.allocatedAmount ?? "0"),
    spent: parseFloat(c.totalSpent),
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Budget Dashboard</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Budget</p>
          <p className="text-2xl font-bold text-dragon-blue-500">{formatCurrency(totalBudget)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Spent</p>
          <p className="text-2xl font-bold text-dragon-gold-600">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Remaining</p>
          <p className={`text-2xl font-bold ${remaining >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(remaining)}</p>
        </div>
      </div>

      <div className="mb-6">
        <BudgetCharts categories={chartData} />
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4"><h2 className="font-semibold">Categories</h2></div>
        {categories.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No budget data synced yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {categories.map((cat) => {
              const allocated = parseFloat(cat.allocatedAmount ?? "0");
              const spent = parseFloat(cat.totalSpent);
              const pct = allocated > 0 ? (spent / allocated) * 100 : 0;
              return (
                <div key={cat.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{cat.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(spent)} / {formatCurrency(allocated)}</span>
                  </div>
                  <ProgressBar value={pct} barClassName={pct > 90 ? "bg-destructive" : "bg-dragon-gold-400"} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4"><h2 className="font-semibold">Recent Transactions</h2></div>
        {recentTransactions.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Date</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((t) => (
                  <tr key={t.id} className="border-b border-border">
                    <td className="p-3">{formatDate(t.date)}</td>
                    <td className="p-3">{t.description}</td>
                    <td className="p-3">{t.categoryName ?? "—"}</td>
                    <td className={`p-3 text-right font-medium ${parseFloat(t.amount) < 0 ? "text-destructive" : "text-success"}`}>
                      {formatCurrency(parseFloat(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
