import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { volunteerHours, users } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function VolunteerHoursPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [myHours, leaderboard] = await Promise.all([
    db
      .select()
      .from(volunteerHours)
      .where(eq(volunteerHours.userId, userId))
      .orderBy(desc(volunteerHours.date)),
    db
      .select({
        userId: volunteerHours.userId,
        userName: users.name,
        totalHours: sql<string>`sum(${volunteerHours.hours})`,
      })
      .from(volunteerHours)
      .innerJoin(users, eq(volunteerHours.userId, users.id))
      .where(eq(volunteerHours.approved, true))
      .groupBy(volunteerHours.userId, users.name)
      .orderBy(sql`sum(${volunteerHours.hours}) desc`)
      .limit(10),
  ]);

  const approvedTotal = myHours
    .filter((h) => h.approved)
    .reduce((sum, h) => sum + parseFloat(h.hours), 0);
  const pendingCount = myHours.filter((h) => !h.approved).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Volunteer Hours</h1>
          <p className="text-muted-foreground">Track and manage your volunteer contributions</p>
        </div>
        <Link
          href="/volunteer-hours/submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          Log Hours
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Approved Hours</p>
          <p className="text-2xl font-bold">{approvedTotal.toFixed(1)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Pending Approval</p>
          <p className="text-2xl font-bold">{pendingCount}</p>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">My Hours</h2>
        </div>
        {myHours.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No hours logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Event</th>
                  <th className="p-3">Hours</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {myHours.map((h) => (
                  <tr key={h.id} className="border-b border-border">
                    <td className="p-3">{h.eventName}</td>
                    <td className="p-3">{h.hours}</td>
                    <td className="p-3">{formatDate(h.date)}</td>
                    <td className="p-3">{h.category}</td>
                    <td className="p-3">
                      <Badge variant={h.approved ? "success" : "secondary"}>
                        {h.approved ? "Approved" : "Pending"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Top Volunteers</h2>
        </div>
        {leaderboard.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No approved hours yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {leaderboard.map((entry, i) => (
              <div key={entry.userId} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-dragon-gold-100 text-xs font-bold text-dragon-gold-700">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{entry.userName ?? "Unknown"}</span>
                </div>
                <span className="text-sm font-semibold">{parseFloat(entry.totalHours).toFixed(1)} hrs</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
