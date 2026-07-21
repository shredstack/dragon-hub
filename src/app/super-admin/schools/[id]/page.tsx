import {
  getSchoolDetails,
  getSchoolMembers,
} from "@/actions/super-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Users, Shield, UserCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SchoolActions } from "./school-actions";
import { AddAdminForm } from "./add-admin-form";
import { MemberActions } from "./member-actions";
import { SCHOOL_ROLES } from "@/lib/constants";

interface PageProps {
  params: Promise<{ id: string }>;
}

const badge =
  "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium";

function roleBadgeClass(role: string) {
  if (role === "admin") return "bg-purple-100 text-purple-700";
  if (role === "pta_board") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
}

function statusBadgeClass(status: string) {
  if (status === "approved") return "bg-green-100 text-green-700";
  if (status === "expired") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export default async function SchoolDetailPage({ params }: PageProps) {
  const { id } = await params;

  let school;
  let members;

  try {
    [school, members] = await Promise.all([
      getSchoolDetails(id),
      getSchoolMembers(id),
    ]);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/super-admin/schools"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Schools
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{school.name}</h1>
          <p className="text-muted-foreground">
            {school.mascot && `${school.mascot} • `}
            {school.address || "No address set"}
          </p>
        </div>
        <SchoolActions school={school} />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school.stats.totalMembers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school.stats.adminCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PTA Board</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school.stats.ptaBoardCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{school.stats.memberCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Join Code Card */}
      <Card>
        <CardHeader>
          <CardTitle>Join Code</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <code className="rounded-lg bg-muted px-4 py-2 text-2xl font-bold tracking-wider">
              {school.joinCode}
            </code>
            <p className="text-sm text-muted-foreground">
              Share this code with school members so they can join.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Add Admin */}
      <Card>
        <CardHeader>
          <CardTitle>Assign School Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <AddAdminForm schoolId={school.id} />
        </CardContent>
      </Card>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No members yet. Share the join code to invite members.
            </p>
          ) : (
            <>
            {/* Mobile cards — seven columns don't fit a phone, and this is the
                page a super admin opens on their phone to unlock a school. */}
            <div className="space-y-3 md:hidden">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{member.userName || "—"}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {member.userEmail}
                      </p>
                    </div>
                    <MemberActions
                      membershipId={member.id}
                      currentRole={member.role as "admin" | "pta_board" | "member"}
                      currentStatus={
                        member.status as "approved" | "expired" | "revoked"
                      }
                      userName={member.userName}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`${badge} ${roleBadgeClass(member.role)}`}>
                      {SCHOOL_ROLES[member.role as keyof typeof SCHOOL_ROLES]}
                    </span>
                    <span
                      className={`${badge} ${statusBadgeClass(member.status)}`}
                    >
                      {member.status}
                    </span>
                    <span
                      className={`font-mono text-xs ${
                        member.schoolYear === school.currentSchoolYear
                          ? "font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {member.schoolYear}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      joined{" "}
                      {member.createdAt
                        ? new Date(member.createdAt).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Role</th>
                    <th className="pb-3 font-medium">Year</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Joined</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">
                        {member.userName || "—"}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {member.userEmail}
                      </td>
                      <td className="py-3">
                        <span className={`${badge} ${roleBadgeClass(member.role)}`}>
                          {SCHOOL_ROLES[member.role as keyof typeof SCHOOL_ROLES]}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`font-mono text-xs ${
                            member.schoolYear === school.currentSchoolYear
                              ? "font-semibold"
                              : "text-muted-foreground"
                          }`}
                        >
                          {member.schoolYear}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`${badge} ${statusBadgeClass(member.status)}`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {member.createdAt
                          ? new Date(member.createdAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-3">
                        {/* Always rendered. Previously this was gated on
                            status === "approved", so a school whose memberships
                            had all expired had no actions at all and could only
                            be recovered from the database. */}
                        <MemberActions
                          membershipId={member.id}
                          currentRole={member.role as "admin" | "pta_board" | "member"}
                          currentStatus={member.status as "approved" | "expired" | "revoked"}
                          userName={member.userName}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
