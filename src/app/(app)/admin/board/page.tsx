import { auth } from "@/lib/auth";
import { assertPtaBoard, getCurrentSchoolId, isSchoolPtaBoardOrAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  classrooms,
  volunteerHours,
  fundraisers,
  budgetCategories,
  budgetTransactions,
  eventPlans,
  schoolMemberships,
} from "@/lib/db/schema";
import { sql, eq, and, isNotNull } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils";
import { PtaBoardSection } from "@/components/admin/pta-board-section";
import { HubSectionsFilter } from "@/components/admin/hub-sections-filter";
import { GenerateEmbeddingsCard } from "@/components/admin/generate-embeddings-card";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getBoardPositionsWithSeed } from "@/lib/board-positions";
import { ADMIN_HUB_SECTIONS } from "@/lib/admin-nav";
import type { PtaBoardPosition } from "@/types";

export default async function PTABoardHubPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;
  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Check if current user can edit board positions (PTA board or admin)
  const canEditBoard = await isSchoolPtaBoardOrAdmin(session.user.id, schoolId);

  // The positions this school actually runs — drives the roster grid's slots
  // and their order. Inactive ones are left out so a position the school
  // doesn't fill stops showing up as permanently vacant.
  const schoolBoardPositions = await getBoardPositionsWithSeed(schoolId);

  // Get board members with positions
  const boardMembersWithPositions = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved"),
      eq(schoolMemberships.role, "pta_board"),
      isNotNull(schoolMemberships.boardPosition)
    ),
    with: {
      user: true,
    },
  });

  // Get all PTA board members (for assignment dropdown)
  const allPtaBoardMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved"),
      eq(schoolMemberships.role, "pta_board")
    ),
    with: {
      user: true,
    },
  });

  // Transform data for the component
  const boardMembers = boardMembersWithPositions.map((m) => ({
    membershipId: m.id,
    userId: m.userId,
    position: m.boardPosition as PtaBoardPosition,
    user: {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    },
  }));

  // Sorted by display name — the dropdown scrolls, so insertion order made a
  // long board look like it was missing people who were just below the fold.
  const ptaBoardMembersForDropdown = allPtaBoardMembers
    .map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      userName: m.user.name,
      userEmail: m.user.email,
      userImage: m.user.image,
    }))
    .sort((a, b) =>
      (a.userName ?? a.userEmail).localeCompare(b.userName ?? b.userEmail, undefined, {
        sensitivity: "base",
      })
    );

  // Both counts are school- and year-scoped: unscoped, they reported every user
  // and classroom on the platform, so a board saw other schools' numbers.
  const [{ count: userCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "approved")
      )
    );

  const [{ count: classroomCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear),
        eq(classrooms.active, true)
      )
    );

  const [{ count: pendingCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(volunteerHours)
    .where(
      and(
        eq(volunteerHours.schoolId, schoolId),
        eq(volunteerHours.approved, false)
      )
    );

  const [{ count: fundraiserCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(fundraisers)
    .where(
      and(eq(fundraisers.schoolId, schoolId), eq(fundraisers.active, true))
    );

  const [{ total: totalAllocated }] = await db
    .select({
      total: sql<string>`coalesce(sum(${budgetCategories.allocatedAmount}), 0)`,
    })
    .from(budgetCategories)
    .where(
      and(
        eq(budgetCategories.schoolId, schoolId),
        eq(budgetCategories.schoolYear, schoolYear)
      )
    );

  const [{ total: totalSpent }] = await db
    .select({
      total: sql<string>`coalesce(sum(${budgetTransactions.amount}), 0)`,
    })
    .from(budgetTransactions)
    .where(eq(budgetTransactions.schoolId, schoolId));

  const [{ count: pendingApprovalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventPlans)
    .where(
      and(
        eq(eventPlans.schoolId, schoolId),
        eq(eventPlans.status, "pending_approval")
      )
    );

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

      <div className="mt-8">
        <PtaBoardSection
          schoolId={schoolId}
          boardMembers={boardMembers}
          allPtaBoardMembers={ptaBoardMembersForDropdown}
          positions={schoolBoardPositions}
          canEdit={canEditBoard}
        />
      </div>

      <HubSectionsFilter sections={ADMIN_HUB_SECTIONS} />

      {/* AI Features Section */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">AI Features</h2>
        <div className="max-w-md">
          <GenerateEmbeddingsCard />
        </div>
      </div>
    </div>
  );
}
