import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getUserSchoolMembership,
  isSuperAdmin,
  isSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

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

  // Check if user is a super admin (they can access without school membership)
  const userIsSuperAdmin = await isSuperAdmin(userId);

  // Get the user's school membership
  const schoolMembership = await getUserSchoolMembership(userId);

  // If user has no school membership and is not a super admin, redirect to join-school
  if (!schoolMembership && !userIsSuperAdmin) {
    redirect("/join-school");
  }

  // Check if user is PTA board or admin for their school
  const userIsPtaBoard = schoolMembership
    ? await isSchoolPtaBoardOrAdmin(userId, schoolMembership.schoolId)
    : userIsSuperAdmin; // Super admins get admin access

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        isPtaBoard={userIsPtaBoard}
        isSuperAdmin={userIsSuperAdmin}
        schoolName={schoolMembership?.school?.name}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userName={session.user.name ?? null}
          userEmail={session.user.email ?? ""}
          isPtaBoard={userIsPtaBoard}
          isSuperAdmin={userIsSuperAdmin}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
