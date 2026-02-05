import { listAllSchools } from "@/actions/super-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function SchoolsPage() {
  const schools = await listAllSchools();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schools</h1>
          <p className="text-muted-foreground">
            Manage all schools in the system
          </p>
        </div>
        <Link
          href="/super-admin/schools/new"
          className="flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          Add School
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Schools ({schools.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {schools.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No schools yet. Create your first school to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">School Name</th>
                    <th className="pb-3 font-medium">Join Code</th>
                    <th className="pb-3 font-medium">Members</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((school) => (
                    <tr key={school.id} className="border-b last:border-0">
                      <td className="py-3">
                        <Link
                          href={`/super-admin/schools/${school.id}`}
                          className="font-medium text-purple-600 hover:underline"
                        >
                          {school.name}
                        </Link>
                        {school.mascot && (
                          <p className="text-sm text-muted-foreground">
                            {school.mascot}
                          </p>
                        )}
                      </td>
                      <td className="py-3">
                        <code className="rounded bg-muted px-2 py-1 text-sm">
                          {school.joinCode}
                        </code>
                      </td>
                      <td className="py-3">{school.memberCount}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            school.active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {school.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {school.createdAt
                          ? new Date(school.createdAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
