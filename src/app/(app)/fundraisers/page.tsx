import { db } from "@/lib/db";
import { fundraisers } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Heart } from "lucide-react";
import Link from "next/link";

export default async function FundraisersPage() {
  const allFundraisers = await db
    .select({
      id: fundraisers.id,
      name: fundraisers.name,
      goalAmount: fundraisers.goalAmount,
      startDate: fundraisers.startDate,
      endDate: fundraisers.endDate,
      active: fundraisers.active,
      latestRaised: sql<string>`(
        select total_raised from fundraiser_stats
        where fundraiser_stats.fundraiser_id = ${fundraisers.id}
        order by snapshot_time desc limit 1
      )`,
      latestDonors: sql<number>`(
        select total_donors from fundraiser_stats
        where fundraiser_stats.fundraiser_id = ${fundraisers.id}
        order by snapshot_time desc limit 1
      )`,
    })
    .from(fundraisers)
    .orderBy(desc(fundraisers.active), desc(fundraisers.startDate));

  const active = allFundraisers.filter((f) => f.active);
  const past = allFundraisers.filter((f) => !f.active);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Fundraisers</h1>
        <p className="text-muted-foreground">Track fundraising progress and goals</p>
      </div>

      {active.length === 0 && past.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <Heart className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No fundraisers yet.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 font-semibold">Active Fundraisers</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {active.map((f) => {
                  const goal = parseFloat(f.goalAmount ?? "0");
                  const raised = parseFloat(f.latestRaised ?? "0");
                  const pct = goal > 0 ? (raised / goal) * 100 : 0;
                  return (
                    <Link key={f.id} href={`/fundraisers/${f.id}`} className="rounded-lg border border-border bg-card p-5 transition-all hover:shadow-md">
                      <h3 className="mb-1 font-semibold">{f.name}</h3>
                      <div className="mb-3 flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-dragon-gold-600">{formatCurrency(raised)}</span>
                        {goal > 0 && <span className="text-sm text-muted-foreground">of {formatCurrency(goal)}</span>}
                      </div>
                      {goal > 0 && <ProgressBar value={pct} barClassName="bg-dragon-gold-400" className="mb-2" />}
                      <div className="flex justify-between text-xs text-muted-foreground">
                        {f.latestDonors != null && <span>{f.latestDonors} donors</span>}
                        {f.startDate && f.endDate && <span>{formatDate(f.startDate)} — {formatDate(f.endDate)}</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h2 className="mb-4 font-semibold">Past Fundraisers</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {past.map((f) => {
                  const raised = parseFloat(f.latestRaised ?? "0");
                  return (
                    <Link key={f.id} href={`/fundraisers/${f.id}`} className="rounded-lg border border-border bg-card p-5 opacity-75 transition-all hover:opacity-100">
                      <h3 className="font-semibold">{f.name}</h3>
                      <p className="text-sm text-muted-foreground">Raised: {formatCurrency(raised)}</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
