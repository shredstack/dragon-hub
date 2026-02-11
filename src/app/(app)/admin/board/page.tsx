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
import {
  Users,
  ListChecks,
  Tags,
  DollarSign,
  Heart,
  School,
  ShieldCheck,
} from "lucide-react";

interface HubCard {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

interface HubSection {
  title: string;
  cards: HubCard[];
}

export default async function PTABoardHubPage() {
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
    { label: "Pending Volunteer Hours", value: pendingCount, highlight: pendingCount > 0 },
    { label: "Active Fundraisers", value: fundraiserCount },
    { label: "Events Pending Approval", value: pendingApprovalCount, highlight: pendingApprovalCount > 0 },
    {
      label: "Budget Allocated",
      value: formatCurrency(Number(totalAllocated)),
    },
    { label: "Budget Spent", value: formatCurrency(Number(totalSpent)) },
  ];

  const hubSections: HubSection[] = [
    {
      title: "Content & Communication",
      cards: [
        {
          label: "Manage Members",
          description: "View and manage school member directory",
          href: "/admin/members",
          icon: Users,
        },
        {
          label: "Meeting Agendas",
          description: "Generate and manage PTA meeting agendas",
          href: "/minutes/agenda",
          icon: ListChecks,
        },
        {
          label: "Tags",
          description: "Manage tags for organizing content",
          href: "/admin/tags",
          icon: Tags,
        },
      ],
    },
    {
      title: "Finance & Fundraising",
      cards: [
        {
          label: "Manage Budget",
          description: "Budget categories and transactions",
          href: "/admin/budget",
          icon: DollarSign,
        },
        {
          label: "Manage Fundraisers",
          description: "Create and track fundraising campaigns",
          href: "/admin/fundraisers",
          icon: Heart,
        },
      ],
    },
    {
      title: "Operations",
      cards: [
        {
          label: "Manage Classrooms",
          description: "Configure classroom settings and room parents",
          href: "/admin/classrooms",
          icon: School,
        },
        {
          label: "Approve Volunteer Hours",
          description: "Review and approve submitted hours",
          href: "/admin/volunteer-hours",
          icon: ShieldCheck,
        },
      ],
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">PTA Board Hub</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your command center for managing PTA operations and activities.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-lg border bg-card p-4 ${
              stat.highlight
                ? "border-dragon-gold-500 bg-dragon-gold-500/5"
                : "border-border"
            }`}
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold ${stat.highlight ? "text-dragon-gold-600" : ""}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-8">
        {hubSections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-4 text-lg font-semibold">{section.title}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.cards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-dragon-blue-500 hover:bg-dragon-blue-500/5"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-dragon-blue-500/10 p-2 text-dragon-blue-500">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium group-hover:text-dragon-blue-500">
                        {card.label}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
