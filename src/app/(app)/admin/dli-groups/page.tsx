import { auth } from "@/lib/auth";
import { assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, dliGroups } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { DliGroupForm } from "./dli-group-form";
import { ArrowLeft } from "lucide-react";

export default async function AdminDliGroupsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;
  await assertPtaBoard(session.user.id);

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  // Get all DLI groups with classroom counts
  const groups = await db
    .select({
      id: dliGroups.id,
      name: dliGroups.name,
      language: dliGroups.language,
      color: dliGroups.color,
      sortOrder: dliGroups.sortOrder,
      active: dliGroups.active,
      classroomCount: sql<number>`count(${classrooms.id})::int`,
    })
    .from(dliGroups)
    .leftJoin(
      classrooms,
      and(
        eq(classrooms.dliGroupId, dliGroups.id),
        eq(classrooms.active, true)
      )
    )
    .where(eq(dliGroups.schoolId, schoolId))
    .groupBy(dliGroups.id)
    .orderBy(dliGroups.sortOrder, dliGroups.name);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/classrooms"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Classrooms
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">DLI Groups</h1>
            <p className="text-sm text-muted-foreground">
              Configure Dual Language Immersion groups for your school. Classrooms can be
              assigned to these groups.
            </p>
          </div>
          <DliGroupForm />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">
            No DLI groups configured yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Name</th>
                  <th className="p-3">Language</th>
                  <th className="p-3">Color</th>
                  <th className="p-3">Classrooms</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b border-border">
                    <td className="p-3 font-medium">{group.name}</td>
                    <td className="p-3">{group.language ?? "-"}</td>
                    <td className="p-3">
                      {group.color ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded border"
                            style={{ backgroundColor: group.color }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {group.color}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="p-3">{group.classroomCount}</td>
                    <td className="p-3">
                      <Badge variant={group.active ? "default" : "secondary"}>
                        {group.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <DliGroupForm
                        group={{
                          id: group.id,
                          name: group.name,
                          language: group.language,
                          color: group.color,
                          sortOrder: group.sortOrder,
                          active: group.active,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
