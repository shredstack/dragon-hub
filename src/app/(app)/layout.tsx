import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getSchoolAccess,
  getCurrentSchoolId,
  isSuperAdmin,
  isSchoolPtaBoardOrAdmin,
  isSchoolAdmin,
  canAccessEventPlans,
} from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CapacitorBridge } from "@/components/mobile/capacitor-bridge";
import { RefreshOnFocus } from "@/components/layout/refresh-on-focus";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
    ? await isSchoolPtaBoardOrAdmin(userId, schoolId)
    : userIsSuperAdmin; // Super admins get admin access

  // Check if user is school admin (for School Admin hub visibility)
  const userIsSchoolAdmin = schoolId
    ? await isSchoolAdmin(userId, schoolId)
    : userIsSuperAdmin;

  // Event Plans is board/admin territory plus whoever has been invited onto a
  // specific plan, so the nav entry only appears for people it leads somewhere.
  const userCanViewEventPlans = schoolId
    ? await canAccessEventPlans(userId, schoolId)
    : userIsSuperAdmin;

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden md:h-dvh md:flex-row">
      <CapacitorBridge />
      <RefreshOnFocus />
      <Sidebar
        isPtaBoard={userIsPtaBoard}
        isSchoolAdmin={userIsSchoolAdmin}
        isSuperAdmin={userIsSuperAdmin}
        canViewEventPlans={userCanViewEventPlans}
        schoolName={access?.school?.name}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userName={profile?.name ?? session.user.name ?? null}
          userEmail={session.user.email ?? ""}
          userImage={profile?.image ?? null}
          isPtaBoard={userIsPtaBoard}
          isSchoolAdmin={userIsSchoolAdmin}
          isSuperAdmin={userIsSuperAdmin}
          canViewEventPlans={userCanViewEventPlans}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
