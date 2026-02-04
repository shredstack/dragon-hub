import { db } from "@/lib/db";
import { fundraisers, fundraiserStats } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/progress-bar";

interface FundraiserPageProps {
  params: Promise<{ id: string }>;
}

export default async function FundraiserPage({ params }: FundraiserPageProps) {
  const { id } = await params;

  const fundraiser = await db.query.fundraisers.findFirst({
    where: eq(fundraisers.id, id),
  });

  if (!fundraiser) notFound();

  const stats = await db
    .select()
    .from(fundraiserStats)
    .where(eq(fundraiserStats.fundraiserId, id))
    .orderBy(desc(fundraiserStats.snapshotTime));

  const latest = stats[0];
  const goal = parseFloat(fundraiser.goalAmount ?? "0");
  const raised = parseFloat(latest?.totalRaised ?? "0");
  const pct = goal > 0 ? (raised / goal) * 100 : 0;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">{fundraiser.name}</h1>
      {fundraiser.startDate && fundraiser.endDate && (
        <p className="mb-6 text-muted-foreground">
          {formatDate(fundraiser.startDate)} — {formatDate(fundraiser.endDate)}
        </p>
      )}

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-dragon-gold-600">{formatCurrency(raised)}</span>
          {goal > 0 && <span className="text-lg text-muted-foreground">of {formatCurrency(goal)} goal</span>}
        </div>
        {goal > 0 && <ProgressBar value={pct} barClassName="bg-dragon-gold-400" className="mb-4 h-3" />}
        {latest?.totalDonors != null && (
          <p className="text-sm text-muted-foreground">{latest.totalDonors} total donors</p>
        )}
      </div>

      {stats.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4"><h2 className="font-semibold">Progress History</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Date</th>
                  <th className="p-3">Raised</th>
                  <th className="p-3">Donors</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.id} className="border-b border-border">
                    <td className="p-3">{formatDateTime(s.snapshotTime!)}</td>
                    <td className="p-3">{formatCurrency(parseFloat(s.totalRaised ?? "0"))}</td>
                    <td className="p-3">{s.totalDonors ?? "—"}</td>
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
