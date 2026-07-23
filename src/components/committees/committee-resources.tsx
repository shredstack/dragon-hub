import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getCommitteeResources } from "@/actions/knowledge";

export type CommitteeResource = Awaited<
  ReturnType<typeof getCommitteeResources>
>[number];

/**
 * Knowledge Base articles the board shared with this committee.
 *
 * Lives on the workspace rather than only in the Knowledge Base because that's
 * where the committee already is — a handbook nobody can find is a handbook
 * nobody reads.
 */
export function CommitteeResources({
  resources,
  canManage,
}: {
  resources: CommitteeResource[];
  canManage: boolean;
}) {
  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-12 text-center">
        <BookOpen className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No resources have been shared with this committee yet.
        </p>
        {canManage && (
          <Link
            href="/knowledge/new"
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Share an article
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Link
            href="/knowledge/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            Share an article
          </Link>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {resources.map((r) => (
          <Link
            key={r.id}
            href={`/knowledge/${r.slug}`}
            className="flex flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            <h3 className="font-semibold">{r.title}</h3>
            {r.summary && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {r.summary}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {r.category && <Badge variant="secondary">{r.category}</Badge>}
              {r.updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Updated {new Date(r.updatedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
