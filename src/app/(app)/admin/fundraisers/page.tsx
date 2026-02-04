import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { fundraisers, fundraiserStats } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FundraiserForm } from "./fundraiser-form";

export default async function AdminFundraisersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const allFundraisers = await db
    .select({
      id: fundraisers.id,
      name: fundraisers.name,
      goalAmount: fundraisers.goalAmount,
      startDate: fundraisers.startDate,
      endDate: fundraisers.endDate,
      active: fundraisers.active,
      latestRaised: sql<string | null>`(
        select ${fundraiserStats.totalRaised}
        from ${fundraiserStats}
        where ${fundraiserStats.fundraiserId} = ${fundraisers.id}
        order by ${fundraiserStats.snapshotTime} desc
        limit 1
      )`,
    })
    .from(fundraisers)
    .orderBy(desc(fundraisers.startDate));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage Fundraisers</h1>
        <FundraiserForm />
      </div>

      {allFundraisers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">
            No fundraisers yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Name</th>
                  <th className="p-3">Goal</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3">End Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Raised</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allFundraisers.map((f) => (
                  <tr key={f.id} className="border-b border-border">
                    <td className="p-3 font-medium">{f.name}</td>
                    <td className="p-3">
                      {f.goalAmount
                        ? formatCurrency(Number(f.goalAmount))
                        : "-"}
                    </td>
                    <td className="p-3">
                      {f.startDate ? formatDate(f.startDate) : "-"}
                    </td>
                    <td className="p-3">
                      {f.endDate ? formatDate(f.endDate) : "-"}
                    </td>
                    <td className="p-3">
                      <Badge variant={f.active ? "default" : "secondary"}>
                        {f.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {f.latestRaised
                        ? formatCurrency(Number(f.latestRaised))
                        : "-"}
                    </td>
                    <td className="p-3">
                      <FundraiserForm
                        fundraiser={{
                          id: f.id,
                          name: f.name,
                          goalAmount: f.goalAmount,
                          startDate: f.startDate,
                          endDate: f.endDate,
                          active: f.active,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
