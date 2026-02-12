import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { volunteerHours, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { formatDate } from "@/lib/utils";
import { ApprovalActions } from "./approval-actions";

export default async function AdminVolunteerHoursPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const pendingHours = await db
    .select({
      id: volunteerHours.id,
      eventName: volunteerHours.eventName,
      hours: volunteerHours.hours,
      date: volunteerHours.date,
      category: volunteerHours.category,
      userName: users.name,
      userEmail: users.email,
    })
    .from(volunteerHours)
    .innerJoin(users, eq(volunteerHours.userId, users.id))
    .where(eq(volunteerHours.approved, false))
    .orderBy(desc(volunteerHours.date));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Approve Volunteer Hours</h1>

      {pendingHours.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">No pending hours to approve.</p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {pendingHours.map((h) => (
              <div
                key={h.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{h.userName ?? h.userEmail}</p>
                    <p className="text-sm">{h.eventName}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(h.date)} · {h.category}
                    </p>
                  </div>
                  <p className="font-semibold">{h.hours} hrs</p>
                </div>
                <div className="mt-3">
                  <ApprovalActions hourId={h.id} />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Volunteer</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">Hours</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingHours.map((h) => (
                    <tr key={h.id} className="border-b border-border">
                      <td className="p-3">{h.userName ?? h.userEmail}</td>
                      <td className="p-3">{h.eventName}</td>
                      <td className="p-3">{h.hours}</td>
                      <td className="p-3">{formatDate(h.date)}</td>
                      <td className="p-3">{h.category}</td>
                      <td className="p-3">
                        <ApprovalActions hourId={h.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
