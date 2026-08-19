import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getSchoolAccess,
  getCurrentSchoolId,
  isSuperAdmin,
  isPtaBoardMember,
  isSchoolAdminRole,
  isSchoolLeadership,
  canAccessEventPlans,
  canAccessCommittees,
} from "@/lib/auth-helpers";
import {
  getModuleVisibility,
  isModuleVisibleToMembers,
} from "@/lib/module-visibility";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CapacitorBridge } from "@/components/mobile/capacitor-bridge";
import { RefreshOnFocus } from "@/components/layout/refresh-on-focus";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const userId = session.user.id!;

  // Read name/image from the database rather than the JWT: the token is minted
  // at sign-in, so profile edits wouldn't show up until the next sign-in.
  const profile = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true, image: true },
  });

  // Check if user is a super admin (they can access without school membership)
  const userIsSuperAdmin = await isSuperAdmin(userId);

  // Resolve the user's school and whether they're current for its active year.
  const access = await getSchoolAccess(userId, await getCurrentSchoolId());

  // No affiliation with any school at all — they need a join code.
  if (!access && !userIsSuperAdmin) {
    redirect("/join-school");
  }

  // Belongs to the school but hasn't rejoined for the new year. Leadership is
  // exempt: a rollover must never bounce the board out of their own school.
  if (access?.needsRenewal && !access.isLeadership && !userIsSuperAdmin) {
    redirect("/renew-membership");
  }

  const schoolId = access?.schoolId;

  // Check if user is PTA board or admin for their school
  const userIsPtaBoard = schoolId
    ? await isPtaBoardMember(userId, schoolId)
    : userIsSuperAdmin; // Super admins get admin access

  // The School Admin hub is the school's own side of the app — its position
  // catalog, its join codes, its directory — so it appears for school admins
  // and not for the board, who have a hub of their own.
  const userIsSchoolAdmin = schoolId
    ? await isSchoolAdminRole(userId, schoolId)
    : userIsSuperAdmin;

  // Budget and Fundraisers stay reachable for school admins too. They take part
  // in the app rather than observing the board's corner of it, so a module the
  // school switched off for general members still opens for them.
  const userIsLeadership = schoolId
    ? await isSchoolLeadership(userId, schoolId)
    : userIsSuperAdmin;

  // Event Plans is board/admin territory plus whoever has been invited onto a
  // specific plan, so the nav entry only appears for people it leads somewhere.
  const userCanViewEventPlans = schoolId
    ? await canAccessEventPlans(userId, schoolId)
    : userIsSuperAdmin;

  // Committees are more open than event plans — board and admins see all of
  // them, everyone else sees the ones they joined — but the entry still only
  // appears when it leads somewhere.
  const userCanViewCommittees = schoolId
    ? await canAccessCommittees(userId, schoolId)
    : userIsSuperAdmin;

  // Budget and Fundraisers can be switched off per school for general members —
  // leadership keeps the links so they can still maintain what's behind them.
  // Resolved here rather than fetched by the bell on mount, so the badge is
  // correct in the first paint instead of appearing a beat later.
  const [unreadRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  const moduleVisibility = await getModuleVisibility(schoolId);
  const navVisibility = {
    canViewEventPlans: userCanViewEventPlans,
    canViewCommittees: userCanViewCommittees,
    canViewBudget:
      isModuleVisibleToMembers(moduleVisibility, "budget") || userIsLeadership,
    canViewFundraisers:
      isModuleVisibleToMembers(moduleVisibility, "fundraisers") ||
      userIsLeadership,
  };

  return (
    // `print:` variants rather than a @media block in globals.css: the pages
    // that print (a reimbursement request for the binder) are ordinary app
    // pages, so the chrome has to disappear and the scroll containers have to
    // stop clipping — a page inside `overflow-hidden` prints one screenful and
    // silently loses the rest.
    <div className="flex min-h-dvh flex-col overflow-hidden md:h-dvh md:flex-row print:block print:h-auto print:min-h-0 print:overflow-visible">
      <CapacitorBridge />
      <RefreshOnFocus />
      {/* `contents` leaves the flex layout untouched on screen. */}
      <div className="contents print:hidden">
        <Sidebar
          isPtaBoard={userIsPtaBoard}
          isSchoolAdmin={userIsSchoolAdmin}
          isSuperAdmin={userIsSuperAdmin}
          navVisibility={navVisibility}
          schoolName={access?.school?.name}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <div className="contents print:hidden">
          <Header
            userName={profile?.name ?? session.user.name ?? null}
            userEmail={session.user.email ?? ""}
            userImage={profile?.image ?? null}
            isPtaBoard={userIsPtaBoard}
            isSchoolAdmin={userIsSchoolAdmin}
            isSuperAdmin={userIsSuperAdmin}
            navVisibility={navVisibility}
            unreadNotifications={unreadRow?.count ?? 0}
          />
        </div>
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6 print:overflow-visible print:bg-transparent print:p-0">
          {children}
        </main>
      </div>
      {/* Floats over every authenticated page; fixed-position, so it escapes the flex flow. */}
      <div className="contents print:hidden">
        <FeedbackWidget />
      </div>
    </div>
  );
}
