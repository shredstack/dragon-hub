import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessCommittees, getCurrentSchoolId } from "@/lib/auth-helpers";
import { getCommittees } from "@/actions/committees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";

export default async function CommitteesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) notFound();

  // Same gate the sidebar entry uses, so a hand-typed URL lands where the nav
  // said it would — nowhere.
  if (!(await canAccessCommittees(session.user.id, schoolId))) notFound();

  const { committees, canManage } = await getCommittees();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Committees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Every committee running this year."
              : "The committees you're part of."}
          </p>
        </div>
        {canManage && (
          <Link href="/admin/committees">
            <Button variant="outline">Manage committees</Button>
          </Link>
        )}
      </div>

      {committees.length === 0 ? (
        <EmptyState
          icon={Users}
          title={canManage ? "No committees yet" : "You're not on a committee yet"}
          description={
            canManage
              ? "Create one and hand out its join link — anyone who signs up joins immediately."
              : "When you join one, it'll show up here with its message board and task list."
          }
        >
          {canManage && (
            <Link href="/admin/committees">
              <Button className="mt-4">Create a committee</Button>
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {committees.map((c) => {
            // A waitlisted parent has no workspace to enter, so their card is a
            // status, not a link.
            const isWaitlisted = c.myWaitlistPosition !== undefined;
            const card = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">
                    {c.iconEmoji && <span className="mr-1">{c.iconEmoji}</span>}
                    {c.name}
                  </p>
                  <Badge variant="outline">{c.scopeLabel}</Badge>
                </div>

                {c.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                )}

                <p className="mt-3 text-sm text-muted-foreground">
                  {c.capacityMode === "capped" && c.maxSize !== null
                    ? `${c.memberCount} of ${c.maxSize} members`
                    : `${c.memberCount} member${c.memberCount === 1 ? "" : "s"}`}
                  {c.chairNames.length > 0 && ` · ${c.chairNames.join(", ")}`}
                </p>

                <div className="mt-3 flex flex-wrap gap-1">
                  {isWaitlisted && (
                    <Badge variant="warning">
                      You&apos;re #{c.myWaitlistPosition} on the waitlist
                    </Badge>
                  )}
                  {c.stillNeeded > 0 && (
                    <Badge variant="warning">Needs {c.stillNeeded} more</Badge>
                  )}
                  {c.status === "draft" && <Badge variant="secondary">Draft</Badge>}
                  {c.status === "closed" && (
                    <Badge variant="secondary">Closed</Badge>
                  )}
                </div>
              </>
            );

            return isWaitlisted ? (
              <div
                key={c.id}
                className="rounded-lg border border-dashed border-border bg-card p-4"
              >
                {card}
              </div>
            ) : (
              <Link
                key={c.id}
                href={`/committees/${c.id}`}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-dragon-blue-300"
              >
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
