import { getSuperAdminStats, listAllSchools } from "@/actions/super-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Shield } from "lucide-react";
import Link from "next/link";

export default async function SuperAdminDashboard() {
  const [stats, schools] = await Promise.all([
    getSuperAdminStats(),
    listAllSchools(),
  ]);

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

      {/* Schools List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Schools</CardTitle>
          <Link
            href="/super-admin/schools/new"
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            Add School
          </Link>
        </CardHeader>
        <CardContent>
          {schools.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No schools yet. Create your first school to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {schools.map((school) => (
                <Link
                  key={school.id}
                  href={`/super-admin/schools/${school.id}`}
                  className="block rounded-lg border p-4 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{school.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {school.mascot && `${school.mascot} • `}
                        Join Code: <code className="rounded bg-muted px-1">{school.joinCode}</code>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {school.memberCount} members
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {school.active ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
