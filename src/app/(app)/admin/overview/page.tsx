import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  users,
  classrooms,
  volunteerHours,
  fundraisers,
  budgetCategories,
  budgetTransactions,
  eventPlans,
} from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const [{ count: userCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  const [{ count: classroomCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(classrooms)
    .where(eq(classrooms.active, true));

  const [{ count: pendingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(volunteerHours)
    .where(eq(volunteerHours.approved, false));

  const [{ count: fundraiserCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fundraisers)
    .where(eq(fundraisers.active, true));

  const [{ total: totalAllocated }] = await db
    .select({
      total: sql<string>`coalesce(sum(${budgetCategories.allocatedAmount}), 0)`,
    })
    .from(budgetCategories);

  const [{ total: totalSpent }] = await db
    .select({
      total: sql<string>`coalesce(sum(${budgetTransactions.amount}), 0)`,
    })
    .from(budgetTransactions);

  const [{ count: pendingApprovalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventPlans)
    .where(eq(eventPlans.status, "pending_approval"));

  const stats = [
    { label: "Total Members", value: userCount },
    { label: "Active Classrooms", value: classroomCount },
    { label: "Pending Volunteer Hours", value: pendingCount },
    { label: "Active Fundraisers", value: fundraiserCount },
    { label: "Event Plans Pending Approval", value: pendingApprovalCount },
    {
      label: "Budget Allocated",
      value: formatCurrency(Number(totalAllocated)),
    },
    { label: "Budget Spent", value: formatCurrency(Number(totalSpent)) },
  ];

  const quickLinks = [
    { label: "Manage Classrooms", href: "/admin/classrooms" },
    { label: "Approve Volunteer Hours", href: "/admin/volunteer-hours" },
    { label: "Manage Fundraisers", href: "/admin/fundraisers" },
    { label: "Member Directory", href: "/admin/members" },
    { label: "Budget Overview", href: "/budget" },
    { label: "Event Plans (Pending)", href: "/events?filter=pending" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of Dragon Hub activity and quick access to admin tools.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Quick Links</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-border bg-card p-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
