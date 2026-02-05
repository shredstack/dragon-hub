import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { Building2, LayoutDashboard, ArrowLeft } from "lucide-react";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const isAdmin = await isSuperAdmin(session.user.id);
  if (!isAdmin) {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden h-screen w-64 shrink-0 border-r border-border bg-card lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-6 py-5">
            <h1 className="text-xl font-bold text-purple-600">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Global Management</p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            <Link
              href="/super-admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              href="/super-admin/schools"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Building2 className="h-4 w-4" />
              Schools
            </Link>

            <div className="my-3 border-t border-border" />

            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to App
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="text-lg font-bold text-purple-600">Super Admin</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
