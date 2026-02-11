"use client";

import { useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES, SCHOOL_ROLES, PTA_BOARD_POSITIONS } from "@/lib/constants";
import { formatPhoneNumber, getInitials } from "@/lib/utils";
import { MemberActions } from "./member-actions";
import type { SchoolRole, PtaBoardPosition } from "@/types";

interface Member {
  id: string;
  userId: string;
  role: SchoolRole;
  boardPosition: PtaBoardPosition | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    image: string | null;
  };
  classroomCount: number;
  classroomRoles: string | null;
}

interface MembersTableProps {
  members: Member[];
  schoolId: string;
  currentUserId: string;
  canEdit: boolean;
}

export function MembersTable({
  members,
  schoolId,
  currentUserId,
  canEdit,
}: MembersTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredMembers = members.filter((m) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = (m.user.name ?? "").toLowerCase();
    return name.includes(query);
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredMembers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <p className="text-muted-foreground">
            {searchQuery ? "No members match your search." : "No members found."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">School Role</th>
                  <th className="p-3">Classroom Roles</th>
                  <th className="p-3">Classrooms</th>
                  <th className="p-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const initials = m.user.name
                    ? getInitials(m.user.name)
                    : m.user.email[0].toUpperCase();
                  return (
                    <tr key={m.id} className="border-b border-border">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {m.user.image ? (
                            <Image
                              src={m.user.image}
                              alt={m.user.name ?? "Profile"}
                              width={32}
                              height={32}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dragon-blue-500 text-xs font-bold text-white">
                              {initials}
                            </div>
                          )}
                          <span className="font-medium">
                            {m.user.name ?? "-"}
                          </span>
                        </div>
                      </td>
                      <td className="p-3">{m.user.email}</td>
                      <td className="p-3">
                        {m.user.phone ? formatPhoneNumber(m.user.phone) : "-"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="secondary">
                            {SCHOOL_ROLES[m.role as keyof typeof SCHOOL_ROLES]}
                          </Badge>
                          {m.role === "pta_board" && m.boardPosition && (
                            <Badge variant="outline">
                              {
                                PTA_BOARD_POSITIONS[
                                  m.boardPosition as keyof typeof PTA_BOARD_POSITIONS
                                ]
                              }
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {m.classroomRoles ? (
                          <div className="flex flex-wrap gap-1">
                            {m.classroomRoles.split(", ").map((role) => (
                              <Badge key={role} variant="secondary">
                                {USER_ROLES[role as keyof typeof USER_ROLES] ??
                                  role}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="p-3">{m.classroomCount}</td>
                      <td className="p-3">
                        <MemberActions
                          membershipId={m.id}
                          schoolId={schoolId}
                          userId={m.userId}
                          userName={m.user.name}
                          userEmail={m.user.email}
                          currentRole={m.role}
                          currentBoardPosition={m.boardPosition}
                          isCurrentUser={m.userId === currentUserId}
                          canEdit={canEdit}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
