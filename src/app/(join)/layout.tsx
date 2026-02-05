import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserSchoolMembership } from "@/lib/auth-helpers";

export default async function JoinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  // If user already has a school membership, redirect to dashboard
  const schoolMembership = await getUserSchoolMembership(session.user.id!);
  if (schoolMembership) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-xl font-bold text-dragon-blue-500">Dragon Hub</h1>
      </header>
      <main className="p-4 lg:p-6">{children}</main>
    </div>
  );
}
