"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface BudgetChartsProps {
  categories: { name: string; allocated: number; spent: number }[];
}

export function BudgetCharts({ categories }: BudgetChartsProps) {
  if (categories.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 font-semibold">Budget by Category</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={categories}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
          <Legend />
          <Bar dataKey="allocated" name="Allocated" fill="#1e40af" radius={[4, 4, 0, 0]} />
          <Bar dataKey="spent" name="Spent" fill="#facc15" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
