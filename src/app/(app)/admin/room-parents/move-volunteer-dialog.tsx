"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  moveClassroomCommitteeSeat,
  moveVolunteerSignup,
} from "@/actions/volunteer-signups";
import { getGradeSortOrder } from "@/lib/grade-levels";
import type { ClassroomCommitteeSeat } from "./volunteer-details";

/** A room someone can be moved into, with the counts the board decides on. */
export interface MoveTargetClassroom {
  id: string;
  name: string;
  gradeLevel: string | null;
  roomParentCount: number;
  /** Active per-classroom committee seats in this room, by committee id. */
  committeeCounts: Record<string, number>;
}

/**
 * Every room's counts, for the Move dialog: room parents, and active seats per
 * per-classroom committee so moving an MTM spot can say "2/2".
 */
export function buildMoveTargets(
  rooms: Array<{
    classroom: { id: string; name: string; gradeLevel: string | null };
    roomParentCount: number;
    committeeSeats: ClassroomCommitteeSeat[];
  }>
): MoveTargetClassroom[] {
  return rooms.map((c) => {
    const committeeCounts: Record<string, number> = {};
    for (const seat of c.committeeSeats) {
      if (seat.status !== "active") continue;
      committeeCounts[seat.committeeId] =
        (committeeCounts[seat.committeeId] ?? 0) + 1;
    }
    return {
      id: c.classroom.id,
      name: c.classroom.name,
      gradeLevel: c.classroom.gradeLevel,
      roomParentCount: c.roomParentCount,
      committeeCounts,
    };
  });
}

/** What's being moved: a volunteer signup (with its seats), or one seat. */
export type MoveSubject =
  | {
      kind: "volunteer";
      signupId: string;
      name: string;
      role: "room_parent" | "party_volunteer";
      waitlisted?: boolean;
      /** Committee seats this person holds in the source room. */
      seats: ClassroomCommitteeSeat[];
    }
  | { kind: "seat"; seat: ClassroomCommitteeSeat };

interface Props {
  subject: MoveSubject | null;
  onClose: () => void;
  sourceClassroomId: string;
  sourceClassroomName: string;
  sourceGradeLevel: string | null;
  targets: MoveTargetClassroom[];
  roomParentLimit?: number;
}

export function MoveVolunteerDialog({
  subject,
  onClose,
  sourceClassroomId,
  sourceClassroomName,
  sourceGradeLevel,
  targets,
  roomParentLimit,
}: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const [targetId, setTargetId] = useState("");
  const [movingSeatIds, setMovingSeatIds] = useState<string[]>([]);
  const [notify, setNotify] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever a different person is picked. Seats are ticked by default:
  // a family changing rooms takes all of it with them, and the list is right
  // there to untick the one that stays behind.
  const [lastSubject, setLastSubject] = useState<MoveSubject | null>(null);
  if (subject !== lastSubject) {
    setLastSubject(subject);
    setTargetId("");
    setMovingSeatIds(
      subject?.kind === "volunteer" ? subject.seats.map((s) => s.id) : []
    );
    setNotify(true);
    setError(null);
  }

  // Same-grade rooms first — a split class moves sideways, not up a grade —
  // then everything else in grade order.
  const sourceOrder = getGradeSortOrder(sourceGradeLevel);
  const options = useMemo(
    () =>
      targets
        .filter((t) => t.id !== sourceClassroomId)
        .map((t) => ({ ...t, order: getGradeSortOrder(t.gradeLevel) }))
        .sort((a, b) => {
          const aSame = a.order === sourceOrder ? 0 : 1;
          const bSame = b.order === sourceOrder ? 0 : 1;
          return aSame - bSame || a.order - b.order || a.name.localeCompare(b.name);
        }),
    [targets, sourceClassroomId, sourceOrder]
  );

  if (!subject) return null;

  const name = subject.kind === "volunteer" ? subject.name : subject.seat.name;
  const firstName = name.split(" ")[0];
  const target = options.find((t) => t.id === targetId);

  const roleLabel =
    subject.kind === "seat"
      ? `${subject.seat.committeeName} spot`
      : subject.role === "room_parent"
        ? subject.waitlisted
          ? "place on the room parent waitlist"
          : "room parent spot"
        : "party volunteer signup";

  /** "2/2 room parents" etc. for the target, shown in the picker and below. */
  const countLabel = (t: MoveTargetClassroom) => {
    if (subject.kind === "seat") {
      const n = t.committeeCounts[subject.seat.committeeId] ?? 0;
      return subject.seat.perClassroomLimit
        ? `${n}/${subject.seat.perClassroomLimit} ${subject.seat.committeeName}`
        : `${n} ${subject.seat.committeeName}`;
    }
    return roomParentLimit
      ? `${t.roomParentCount}/${roomParentLimit} room parents`
      : `${t.roomParentCount} room parents`;
  };

  const overLimit = (() => {
    if (!target) return false;
    if (subject.kind === "seat") {
      const limit = subject.seat.perClassroomLimit;
      return (
        limit !== null &&
        (target.committeeCounts[subject.seat.committeeId] ?? 0) >= limit
      );
    }
    return (
      subject.role === "room_parent" &&
      roomParentLimit !== undefined &&
      target.roomParentCount >= roomParentLimit
    );
  })();

  const handleMove = async () => {
    if (!target) return;
    setIsMoving(true);
    setError(null);
    try {
      if (subject.kind === "volunteer") {
        const result = await moveVolunteerSignup(subject.signupId, target.id, {
          moveCommitteeSignupIds: movingSeatIds,
          notify,
        });
        addToast(
          result.movedCommittees > 0
            ? `${name} moved to ${result.classroomName}, with ${result.movedCommittees} committee spot${result.movedCommittees === 1 ? "" : "s"}.`
            : `${name} moved to ${result.classroomName}.`,
          "success"
        );
      } else {
        const result = await moveClassroomCommitteeSeat(
          subject.seat.id,
          target.id,
          { notify }
        );
        addToast(
          `${name}'s ${subject.seat.committeeName} spot moved to ${result.classroomName}.`,
          "success"
        );
      }
      onClose();
      router.refresh();
    } catch (err) {
      console.error("Failed to move volunteer:", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't move them. Please try again."
      );
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {name}</DialogTitle>
          <DialogDescription>
            Moves their {roleLabel} from {sourceClassroomName} to another
            classroom. Their notes, party choices and children come with them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="move-target">New classroom</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id="move-target">
                <SelectValue placeholder="Choose a classroom" />
              </SelectTrigger>
              <SelectContent>
                {options.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.gradeLevel ? ` (${t.gradeLevel})` : ""} · {countLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {subject.kind === "volunteer" && subject.seats.length > 0 && (
            <div className="rounded-lg border border-border p-4 text-sm">
              <p className="font-medium">
                {firstName} also holds committee spots in {sourceClassroomName}:
              </p>
              <div className="mt-2 space-y-2">
                {subject.seats.map((seat) => (
                  <label
                    key={seat.id}
                    className="flex items-start gap-2 text-muted-foreground"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={movingSeatIds.includes(seat.id)}
                      onChange={(e) =>
                        setMovingSeatIds((ids) =>
                          e.target.checked
                            ? [...ids, seat.id]
                            : ids.filter((id) => id !== seat.id)
                        )
                      }
                    />
                    <span>
                      Move their{" "}
                      <span className="font-medium text-foreground">
                        {seat.committeeName}
                      </span>{" "}
                      spot too
                      {seat.status === "waitlisted" && " (waitlisted)"}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Leave one unticked to keep it in {sourceClassroomName}.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            <ul className="list-inside list-disc space-y-1">
              {target && subject.kind === "volunteer" && (
                <li>
                  {firstName} gets access to {target.name}
                  {subject.role === "room_parent"
                    ? ", including its room parent message board"
                    : ""}
                  , and loses access to {sourceClassroomName} unless they
                  volunteer there some other way.
                </li>
              )}
              <li>
                Their spot in {sourceClassroomName} opens up, and whoever is
                first in line for it is moved up and emailed.
              </li>
              {overLimit && target && (
                <li className="font-medium">
                  {target.name} is already at {countLabel(target)} — moving{" "}
                  {firstName} there puts it over the limit.
                </li>
              )}
              {subject.kind === "volunteer" && subject.waitlisted && (
                <li>
                  They get a room parent spot in the new room rather than a
                  place in its line.
                </li>
              )}
            </ul>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            <span>
              Email {firstName} about their new classroom, with a sign-in link
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={!target || isMoving}>
            {isMoving
              ? "Moving..."
              : target
                ? `Move to ${target.name}`
                : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
