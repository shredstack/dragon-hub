"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface DirectoryRow {
  membershipId: string;
  name: string | null;
  email: string;
  role: string;
  positionLabel: string | null;
  joinedAt: string | null;
}

interface Props {
  members: DirectoryRow[];
}

const ROLE_LABELS: Record<string, string> = {
  admin: "School Admin",
  pta_board: "PTA Board",
  member: "Member",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SchoolDirectoryClient({ members }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.positionLabel ?? "").toLowerCase().includes(q) ||
        roleLabel(m.role).toLowerCase().includes(q)
    );
  }, [members, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or role"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {members.length}{" "}
          {members.length === 1 ? "member" : "members"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No one matches that search.
        </p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {filtered.map((m) => (
              <div
                key={m.membershipId}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="font-medium">{m.name ?? m.email}</p>
                <p className="text-sm text-muted-foreground">{m.email}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {roleLabel(m.role)}
                  </span>
                  {m.positionLabel && (
                    <span className="rounded-full bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-200">
                      {m.positionLabel}
                    </span>
                  )}
                  <span className="rounded-full px-2 py-0.5 text-xs text-muted-foreground">
                    Joined {formatDate(m.joinedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Position</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr
                      key={m.membershipId}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 font-medium">
                        {m.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.email}
                      </td>
                      <td className="px-4 py-3">{roleLabel(m.role)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.positionLabel ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(m.joinedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
