"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PTA_BOARD_POSITIONS } from "@/lib/constants";
import { updateBoardPosition } from "@/actions/school-membership";
import { User, ChevronDown, Check } from "lucide-react";
import Image from "next/image";
import { getInitials } from "@/lib/utils";
import type { PtaBoardPosition } from "@/types";

interface BoardMember {
  membershipId: string;
  userId: string;
  position: PtaBoardPosition;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface PtaBoardMember {
  membershipId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}

interface PtaBoardSectionProps {
  schoolId: string;
  boardMembers: BoardMember[];
  allPtaBoardMembers: PtaBoardMember[];
  canEdit: boolean;
}

// Order positions by importance
const POSITION_ORDER: PtaBoardPosition[] = [
  "president",
  "vice_president",
  "president_elect",
  "vp_elect",
  "treasurer",
  "secretary",
  "legislative_vp",
  "public_relations_vp",
  "membership_vp",
  "room_parent_vp",
];

export function PtaBoardSection({
  schoolId,
  boardMembers,
  allPtaBoardMembers,
  canEdit,
}: PtaBoardSectionProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Create a map of position to member
  const positionMap = new Map<PtaBoardPosition, BoardMember>();
  boardMembers.forEach((m) => {
    positionMap.set(m.position, m);
  });

  async function handleAssignPosition(
    position: PtaBoardPosition,
    membershipId: string | null
  ) {
    setLoading(position);
    setOpenDropdown(null);
    try {
      await updateBoardPosition(schoolId, position, membershipId);
      router.refresh();
    } catch (error) {
      console.error("Failed to update position:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update position"
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-lg font-semibold">Current PTA Board</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {POSITION_ORDER.map((position) => {
          const member = positionMap.get(position);
          const isLoading = loading === position;
          const isOpen = openDropdown === position;

          return (
            <div
              key={position}
              className="relative rounded-lg border border-border bg-card p-4"
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {PTA_BOARD_POSITIONS[position]}
              </p>

              {member ? (
                <div className="flex items-center gap-2">
                  {member.user.image ? (
                    <Image
                      src={member.user.image}
                      alt={member.user.name ?? "Profile"}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dragon-blue-500 text-xs font-bold text-white">
                      {member.user.name
                        ? getInitials(member.user.name)
                        : member.user.email[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.user.name ?? member.user.email}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-border">
                    <User className="h-4 w-4" />
                  </div>
                  <p className="text-sm italic">Vacant</p>
                </div>
              )}

              {canEdit && (
                <div className="relative mt-3">
                  <button
                    onClick={() =>
                      setOpenDropdown(isOpen ? null : position)
                    }
                    disabled={isLoading}
                    className="flex w-full items-center justify-between rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <span>{isLoading ? "Updating..." : "Change"}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>

                  {isOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenDropdown(null)}
                      />
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-white text-gray-900 shadow-xl">
                        <button
                          onClick={() => handleAssignPosition(position, null)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                        >
                          <span className="w-4">
                            {!member && <Check className="h-4 w-4" />}
                          </span>
                          <span className="italic text-gray-500">
                            Vacant
                          </span>
                        </button>
                        {allPtaBoardMembers.map((m) => (
                          <button
                            key={m.membershipId}
                            onClick={() =>
                              handleAssignPosition(position, m.membershipId)
                            }
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100"
                          >
                            <span className="w-4">
                              {member?.membershipId === m.membershipId && (
                                <Check className="h-4 w-4" />
                              )}
                            </span>
                            <span className="truncate">
                              {m.userName ?? m.userEmail}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
