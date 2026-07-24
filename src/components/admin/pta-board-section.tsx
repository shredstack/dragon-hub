"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateBoardPosition } from "@/actions/school-membership";
import { User, ChevronDown, Check } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getInitials } from "@/lib/utils";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import type { PtaBoardPosition } from "@/types";
import type { BoardPosition } from "@/lib/board-positions-shared";

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
  /** The school's active positions, in its own order. */
  positions: BoardPosition[];
  canEdit: boolean;
}

export function PtaBoardSection({
  schoolId,
  boardMembers,
  allPtaBoardMembers,
  positions,
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

  // A phone shows one card per position, so the roster is the longest thing
  // between the top of the hub and the first tool. Collapsed, the vacancy count
  // is the part a board actually checks at a glance.
  const vacantCount = positions.filter(
    ({ slug }) => !positionMap.has(slug)
  ).length;

  return (
    <CollapsibleSection
      className="mb-8"
      id="admin-hub:board-roster"
      title="Current PTA Board"
      meta={
        <>
          {positions.length} position{positions.length === 1 ? "" : "s"}
          {vacantCount > 0 && ` · ${vacantCount} vacant`}
        </>
      }
      action={
        canEdit ? (
          <Link
            href="/admin/board/positions"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Manage positions
          </Link>
        ) : undefined
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {positions.map(({ slug: position, label }) => {
          const member = positionMap.get(position);
          const isLoading = loading === position;
          const isOpen = openDropdown === position;

          return (
            <div
              key={position}
              className="relative rounded-lg border border-border bg-card p-4"
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
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
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-white text-gray-900 shadow-xl">
                        {/* The list scrolls; without a count it reads as the
                            whole board when it's only the first few rows. */}
                        <p className="sticky top-0 border-b border-border bg-white px-3 py-1.5 text-xs text-gray-500">
                          {allPtaBoardMembers.length} board member
                          {allPtaBoardMembers.length === 1 ? "" : "s"}
                        </p>
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
    </CollapsibleSection>
  );
}
