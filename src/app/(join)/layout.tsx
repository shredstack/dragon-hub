import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSchoolAccess, getCurrentSchoolId, isSuperAdmin } from "@/lib/auth-helpers";

export default async function JoinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const userId = session.user.id!;

  // Send the user into the app only if they're actually current for their
  // school's active year (or leadership / super admin, who always retain
  // access). Anyone flagged `needsRenewal` stays here to enter the new code —
  // redirecting them onward would bounce them straight back and loop.
  const access = await getSchoolAccess(userId, await getCurrentSchoolId());
  const hasCurrentAccess =
    access && (!access.needsRenewal || access.isLeadership);

  if (hasCurrentAccess || (await isSuperAdmin(userId))) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-xl font-bold text-dragon-blue-500">Dragon Hub</h1>
      </header>
      <main className="p-4 lg:p-6">{children}</main>
    </div>
  );
}
