import { getSuperAdminStats } from "@/actions/super-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Shield, GraduationCap } from "lucide-react";
import Link from "next/link";

interface ManagementCard {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

const managementCards: ManagementCard[] = [
  {
    label: "Schools",
    description: "Create and manage schools, members, and settings",
    href: "/super-admin/schools",
    icon: Building2,
  },
  {
    label: "Onboarding Resources",
    description: "Configure default onboarding resources by state and district",
    href: "/super-admin/onboarding",
    icon: GraduationCap,
  },
];

export default async function SuperAdminDashboard() {
  const stats = await getSuperAdminStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage schools and global settings
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Schools</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeSchools}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalSchools} total ({stats.totalSchools - stats.activeSchools} inactive)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">Registered accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Active Memberships
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMemberships}</div>
            <p className="text-xs text-muted-foreground">Current school year</p>
          </CardContent>
        </Card>
      </div>

      {/* Management Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Management</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {managementCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-purple-500 hover:bg-purple-500/5"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-purple-500/10 p-3 text-purple-500">
                  <card.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium group-hover:text-purple-500">
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
    </div>
  );
}
