"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Download, Eye, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportMembersDialog } from "./export-members-dialog";
import { MemberDetailDialog } from "./member-detail-dialog";
import { ResendInviteButton } from "./resend-invite-button";
import { USER_ROLES, SCHOOL_ROLES } from "@/lib/constants";
import { positionLabel } from "@/lib/board-positions-shared";
import type {
  BoardPosition,
  BoardPositionLabels,
} from "@/lib/board-positions-shared";
import { formatPhoneNumber, getInitials } from "@/lib/utils";
import { MemberActions } from "./member-actions";
import type { SchoolRole, PtaBoardPosition } from "@/types";
import type { MemberExportOptions } from "@/lib/member-export";

/**
 * A row in the directory. Two shapes share it: verified/account members (with a
 * `membershipId`, school role, and classroom data) and pending signups (no
 * account yet — `pending: true`, identified only by email, with the list of
 * things they signed up for in `sources`).
 */
export interface DirectoryMember {
  key: string;
  membershipId: string | null;
  userId: string | null;
  role: SchoolRole | null;
  boardPosition: PtaBoardPosition | null;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  classroomCount: number;
  classroomRoles: string | null;
  /** Rooms this person teaches, comma-joined. Null for everyone else. */
  teacherRooms: string | null;
  verified: boolean;
  pending: boolean;
  sources: string[];
}

type StatusFilter = "all" | "verified" | "unverified";
type RoleFilter = "all" | "teacher" | "room_parent" | "pta_board";

const ROLE_FILTERS: Record<RoleFilter, string> = {
  all: "All roles",
  teacher: "Teachers",
  room_parent: "Room parents",
  pta_board: "PTA board",
};

function hasClassroomRole(member: DirectoryMember, role: string) {
  return (member.classroomRoles ?? "").split(", ").includes(role);
}

/**
 * The role badges for one person, shared by the mobile card and the desktop
 * table so the two can't drift.
 *
 * A teacher is called a Teacher here even though their school membership says
 * `member`: the teacher role is classroom-scoped and confers no governance, so
 * it is deliberately not a `school_role` — but "Member" was the only thing this
 * directory said about them, which is what made it useless for finding out who
 * teaches what. The plain Member badge is dropped for teachers rather than shown
 * alongside, because two badges saying different things about the same column
 * reads as a bug. A teacher who is *also* on the board keeps the board badge:
 * that one carries permissions.
 */
function MemberRoleBadges({
  member,
  positionLabels,
}: {
  member: DirectoryMember;
  positionLabels: BoardPositionLabels;
}) {
  const isTeacher = hasClassroomRole(member, "teacher");

  // A pending row can still be a teacher: the board names teachers on the
  // classroom form, which is a designation, not a signup — so they carry the
  // Teacher badge before they have ever signed in.
  if (member.pending) {
    return (
      <>
        {isTeacher && (
          <Badge className="bg-dragon-blue-500 text-white">
            {USER_ROLES.teacher}
          </Badge>
        )}
        {member.sources.map((s) => (
          <Badge key={s} variant="outline">
            {s}
          </Badge>
        ))}
      </>
    );
  }

  const showSchoolRole = member.role && !(isTeacher && member.role === "member");

  return (
    <>
      {isTeacher && (
        <Badge className="bg-dragon-blue-500 text-white">
          {USER_ROLES.teacher}
        </Badge>
      )}
      {showSchoolRole && member.role && (
        <Badge variant="secondary">
          {SCHOOL_ROLES[member.role as keyof typeof SCHOOL_ROLES]}
        </Badge>
      )}
      {member.role === "pta_board" && member.boardPosition && (
        <Badge variant="outline">
          {positionLabel(positionLabels, member.boardPosition)}
        </Badge>
      )}
      {(member.classroomRoles ?? "")
        .split(", ")
        .filter((role) => role && role !== "teacher")
        .map((role) => (
          <Badge key={role} variant="secondary">
            {USER_ROLES[role as keyof typeof USER_ROLES] ?? role}
          </Badge>
        ))}
    </>
  );
}

interface MembersTableProps {
  members: DirectoryMember[];
  schoolId: string;
  currentUserId: string;
  canEdit: boolean;
  canDelete: boolean;
  exportOptions: MemberExportOptions;
  /** Active positions for the assignment picker. */
  positions: BoardPosition[];
  /** slug -> label, including retired positions so old rows still render. */
  positionLabels: BoardPositionLabels;
}

export function MembersTable({
  members,
  schoolId,
  currentUserId,
  canEdit,
  canDelete,
  exportOptions,
  positions,
  positionLabels,
}: MembersTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [detail, setDetail] = useState<{ email: string; name: string | null } | null>(
    null
  );

  const unverifiedCount = useMemo(
    () => members.filter((m) => !m.verified).length,
    [members]
  );

  const filteredMembers = members.filter((m) => {
    if (statusFilter === "verified" && !m.verified) return false;
    if (statusFilter === "unverified" && m.verified) return false;
    // "PTA board" is the school role; the other two are classroom roles. They
    // are different columns because they answer different questions, and a
    // teacher who is also on the board legitimately matches both.
    if (roleFilter === "pta_board" && m.role !== "pta_board") return false;
    if (
      (roleFilter === "teacher" || roleFilter === "room_parent") &&
      !hasClassroomRole(m, roleFilter)
    ) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (m.name ?? "").toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All members</option>
            <option value="verified">Verified</option>
            <option value="unverified">
              Not verified{unverifiedCount ? ` (${unverifiedCount})` : ""}
            </option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {Object.entries(ROLE_FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="outline"
          onClick={() => setExportOpen(true)}
          className="w-full sm:w-auto"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {unverifiedCount > 0 && statusFilter === "all" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {unverifiedCount} {unverifiedCount === 1 ? "person" : "people"} signed
          up but haven&apos;t confirmed their email yet. You can still see their
          info, drill into what they signed up for, and resend their sign-in link.
        </p>
      )}

      <ExportMembersDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        options={exportOptions}
      />

      <MemberDetailDialog
        email={detail?.email ?? null}
        name={detail?.name}
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />

      {filteredMembers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">
            {searchQuery || statusFilter !== "all" || roleFilter !== "all"
              ? "No members match your filters."
              : "No members found."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {filteredMembers.map((m) => {
              const initials = m.name
                ? getInitials(m.name)
                : m.email[0].toUpperCase();
              return (
                <div
                  key={m.key}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {m.image ? (
                        <Image
                          src={m.image}
                          alt={m.name ?? "Profile"}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dragon-blue-500 text-sm font-bold text-white">
                          {initials}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{m.name ?? "-"}</p>
                        <p className="text-sm text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                    <StatusBadge verified={m.verified} />
                  </div>
                  {m.phone && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatPhoneNumber(m.phone)}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1">
                    <MemberRoleBadges
                      member={m}
                      positionLabels={positionLabels}
                    />
                  </div>
                  {m.teacherRooms && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Teaches {m.teacherRooms}
                    </p>
                  )}
                  {!m.pending && !m.teacherRooms && m.classroomCount > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {m.classroomCount} classroom{m.classroomCount !== 1 && "s"}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDetail({ email: m.email, name: m.name })}
                    >
                      <Eye className="h-4 w-4" />
                      <span className="ml-1">Details</span>
                    </Button>
                    {!m.verified && <ResendInviteButton email={m.email} />}
                    {m.membershipId && m.userId && m.role && (
                      <MemberActions
                        membershipId={m.membershipId}
                        schoolId={schoolId}
                        userId={m.userId}
                        userName={m.name}
                        userEmail={m.email}
                        currentRole={m.role}
                        currentBoardPosition={m.boardPosition}
                        positions={positions}
                        isCurrentUser={m.userId === currentUserId}
                        canEdit={canEdit}
                        canDelete={canDelete}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Roles / Signed up for</th>
                    <th className="p-3">Classrooms</th>
                    <th className="p-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => {
                    const initials = m.name
                      ? getInitials(m.name)
                      : m.email[0].toUpperCase();
                    return (
                      <tr key={m.key} className="border-b border-border">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {m.image ? (
                              <Image
                                src={m.image}
                                alt={m.name ?? "Profile"}
                                width={32}
                                height={32}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dragon-blue-500 text-xs font-bold text-white">
                                {initials}
                              </div>
                            )}
                            <span className="font-medium">{m.name ?? "-"}</span>
                          </div>
                        </td>
                        <td className="p-3">{m.email}</td>
                        <td className="p-3">
                          {m.phone ? formatPhoneNumber(m.phone) : "-"}
                        </td>
                        <td className="p-3">
                          <StatusBadge verified={m.verified} />
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <MemberRoleBadges
                              member={m}
                              positionLabels={positionLabels}
                            />
                          </div>
                        </td>
                        <td className="p-3">
                          {m.teacherRooms ? (
                            <span className="text-xs">{m.teacherRooms}</span>
                          ) : m.pending ? (
                            "-"
                          ) : (
                            m.classroomCount
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setDetail({ email: m.email, name: m.name })
                              }
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">View details</span>
                            </Button>
                            {!m.verified && <ResendInviteButton email={m.email} />}
                            {m.membershipId && m.userId && m.role && (
                              <MemberActions
                                membershipId={m.membershipId}
                                schoolId={schoolId}
                                userId={m.userId}
                                userName={m.name}
                                userEmail={m.email}
                                currentRole={m.role}
                                currentBoardPosition={m.boardPosition}
                                positions={positions}
                                isCurrentUser={m.userId === currentUserId}
                                canEdit={canEdit}
                                canDelete={canDelete}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge variant="secondary">✅ Verified</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-300 text-amber-700">
      ⚠️ Not verified
    </Badge>
  );
}
