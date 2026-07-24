"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type {
  ClassroomCoverage,
  ClassroomCoverageRoom,
  CoveragePerson,
} from "@/actions/committees";
import {
  promoteWaitlistedMember,
  removeCommitteeMember,
} from "@/actions/committees";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AddMemberDialog } from "./add-member-dialog";

interface Props {
  committeeId: string;
  committeeName: string;
  coverage: ClassroomCoverage;
}

/**
 * "Who volunteered for which room, and which rooms still need people" for an
 * every-classroom committee (Meet the Masters) — the same question the room
 * parent dashboard answers for room parents, answered the same way.
 *
 * Without this the board could see a roster of forty names and still have no
 * idea that Room 12 had nobody.
 */
export function ClassroomCoverageTable({
  committeeId,
  committeeName,
  coverage,
}: Props) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const { addToast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const openAdd = (classroomId: string | null) => {
    setAddingFor(classroomId);
    setAddOpen(true);
  };

  const handleRemove = async (person: CoveragePerson, roomName: string) => {
    const ok = await confirm({
      title: `Remove ${person.name} from ${roomName}?`,
      description:
        "They lose access to this committee's message board and tasks. If anyone is waiting for this room, the next person is promoted automatically.",
      confirmLabel: "Remove",
      tone: "destructive",
    });
    if (!ok) return;

    try {
      await removeCommitteeMember(person.id);
      addToast(`${person.name} removed.`, "success");
      router.refresh();
    } catch {
      addToast("Couldn't remove them. Please try again.", "destructive");
    }
  };

  const handlePromote = async (person: CoveragePerson, roomName: string) => {
    const ok = await confirm({
      title: `Give ${person.name} a spot in ${roomName}?`,
      description:
        (person.position ?? 1) > 1
          ? `They're #${person.position} in line for this room. Everyone ahead of them keeps their order.`
          : "They're next in line for this room anyway.",
      confirmLabel: "Promote",
    });
    if (!ok) return;

    try {
      const result = await promoteWaitlistedMember(person.id);
      // Promotion still respects the room's limit, so a full room quietly
      // promotes nobody — say so rather than claiming a seat that wasn't given.
      if (result.promoted === 0) {
        addToast(
          `${roomName} has no free spot. Remove someone first, or raise the limit for every classroom.`,
          "destructive"
        );
      } else {
        addToast(`${person.name} is covering ${roomName}.`, "success");
      }
      router.refresh();
    } catch {
      addToast("Couldn't promote them. Please try again.", "destructive");
    }
  };

  const statusBadge = (filled: number, limit: number) => {
    const variant =
      filled >= limit ? "success" : filled > 0 ? "warning" : "destructive";
    return (
      <Badge variant={variant}>
        {filled}/{limit}
      </Badge>
    );
  };

  // Same grouping the room parent dashboard uses, so a board member reads one
  // coverage table the way they read the other.
  const byGrade = coverage.rooms.reduce(
    (acc, room) => {
      const grade = room.classroom.gradeLevel || "Other";
      (acc[grade] ??= []).push(room);
      return acc;
    },
    {} as Record<string, ClassroomCoverageRoom[]>
  );
  const gradeOrder = [
    "Kindergarten", "K", "1st", "1", "2nd", "2", "3rd", "3", "4th", "4",
    "5th", "5", "6th", "6", "Other",
  ];
  const rank = (grade: string) => {
    const index = gradeOrder.indexOf(grade);
    return index === -1 ? gradeOrder.length : index;
  };
  const grades = Object.keys(byGrade).sort((a, b) => rank(a) - rank(b));

  const roomsNeedingHelp = coverage.partialRooms + coverage.emptyRooms;

  const detailPanel = (room: ClassroomCoverageRoom) => (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 font-medium">
          Volunteers{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({room.filled} of {room.limit})
          </span>
        </h4>
        {room.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has signed up for this classroom yet.
          </p>
        ) : (
          <div className="space-y-2">
            {room.members.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    {m.role === "chair" && <Badge variant="success">Chair</Badge>}
                    {m.willingToChair && m.role !== "chair" && (
                      <Badge variant="warning">⭐ Would chair</Badge>
                    )}
                    {!m.userId && (
                      <Badge variant="outline">Hasn&apos;t signed in yet</Badge>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    <div className="break-all">{m.email}</div>
                    {m.phone && <div>{m.phone}</div>}
                    {m.notes && <div>{m.notes}</div>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start text-red-600 hover:text-red-700"
                  onClick={() => handleRemove(m, room.classroom.name)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {room.waitlist.length > 0 && (
        <div>
          <h4 className="mb-2 font-medium">
            Waiting for this classroom{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({room.waitlist.length})
            </span>
          </h4>
          <div className="space-y-2">
            {room.waitlist.map((w) => (
              <div
                key={w.id}
                className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      #{w.position} · {w.name}
                    </span>
                    {w.willingToChair && (
                      <Badge variant="warning">⭐ Would chair</Badge>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    <div className="break-all">{w.email}</div>
                    {w.phone && <div>{w.phone}</div>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    onClick={() => handlePromote(w, room.classroom.name)}
                  >
                    Give them a spot
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemove(w, room.classroom.name)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button size="sm" onClick={() => openAdd(room.classroom.id)}>
        Add a volunteer to {room.classroom.name}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Classroom Coverage</h2>
          <p className="text-sm text-muted-foreground">
            Every classroom needs {coverage.perClassroomLimit}{" "}
            {coverage.perClassroomLimit === 1 ? "volunteer" : "volunteers"}.{" "}
            {coverage.seatsFilled} of {coverage.seatsNeeded} spots are filled.
          </p>
        </div>
        <Button size="sm" onClick={() => openAdd(null)}>
          Add by hand
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Classrooms</div>
          <div className="text-2xl font-bold">{coverage.rooms.length}</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <div className="text-sm text-green-800">Fully covered</div>
            <Badge variant="success">
              {coverage.perClassroomLimit}/{coverage.perClassroomLimit}
            </Badge>
          </div>
          <div className="text-2xl font-bold text-green-800">
            {coverage.fullRooms}
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-800">Partly covered</div>
          <div className="text-2xl font-bold text-amber-800">
            {coverage.partialRooms}
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="text-sm text-red-800">No volunteers</div>
          <div className="text-2xl font-bold text-red-800">
            {coverage.emptyRooms}
          </div>
        </div>
      </div>

      {coverage.rooms.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          This school year has no classrooms set up yet, so there is nothing to
          cover.
        </p>
      ) : roomsNeedingHelp === 0 ? (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Every classroom is covered. 🎉
        </p>
      ) : null}

      {grades.map((grade) => (
        <div key={grade}>
          <h3 className="mb-3 font-medium text-muted-foreground">{grade}</h3>

          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {byGrade[grade].map((room) => {
              const isOpen = expandedId === room.classroom.id;
              return (
                <div
                  key={room.classroom.id}
                  className="rounded-lg border border-border bg-card"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        className="flex items-center gap-1 text-left font-medium hover:underline"
                        onClick={() =>
                          setExpandedId(isOpen ? null : room.classroom.id)
                        }
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                        {room.classroom.name}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAdd(room.classroom.id)}
                      >
                        Add
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {statusBadge(room.filled, room.limit)}
                      {room.members.length > 0 && (
                        <span className="text-sm text-muted-foreground">
                          {room.members.map((m) => m.name).join(", ")}
                        </span>
                      )}
                      {room.waitlist.length > 0 && (
                        <Badge variant="outline">
                          {room.waitlist.length} waiting
                        </Badge>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 p-4">
                      {detailPanel(room)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table view */}
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Classroom</th>
                  <th className="px-4 py-3 text-left font-medium">Covered</th>
                  <th className="px-4 py-3 text-left font-medium">Volunteers</th>
                  <th className="px-4 py-3 text-left font-medium">Waiting</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byGrade[grade].map((room) => {
                  const isOpen = expandedId === room.classroom.id;
                  return (
                    <Fragment key={room.classroom.id}>
                      <tr
                        className={`hover:bg-muted/30 ${isOpen ? "bg-muted/50" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <button
                            className="font-medium hover:underline"
                            onClick={() =>
                              setExpandedId(isOpen ? null : room.classroom.id)
                            }
                          >
                            {room.classroom.name}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          {statusBadge(room.filled, room.limit)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {room.members.length > 0
                            ? room.members.map((m) => m.name).join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {room.waitlist.length || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAdd(room.classroom.id)}
                            >
                              Add
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setExpandedId(isOpen ? null : room.classroom.id)
                              }
                              aria-label={isOpen ? "Collapse" : "Expand"}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${
                                  isOpen ? "rotate-180" : ""
                                }`}
                              />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={5} className="bg-muted/20 p-4">
                            {detailPanel(room)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {coverage.unassigned.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-medium text-amber-900">
            Not assigned to a classroom ({coverage.unassigned.length})
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            These volunteers hold a seat on {committeeName} but aren&apos;t
            covering any room — usually because their classroom was removed.
            Remove them and add them back to the right room.
          </p>
          <div className="mt-3 space-y-2">
            {coverage.unassigned.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-card p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{m.name}</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {m.email}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start text-red-600 hover:text-red-700"
                  onClick={() => handleRemove(m, "this committee")}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        committeeId={committeeId}
        classroomOptions={coverage.rooms.map((r) => r.classroom)}
        defaultClassroomId={addingFor}
        filledByClassroom={Object.fromEntries(
          coverage.rooms.map((r) => [r.classroom.id, r.filled])
        )}
        perClassroomLimit={coverage.perClassroomLimit}
      />

      {confirmDialog}
    </div>
  );
}
