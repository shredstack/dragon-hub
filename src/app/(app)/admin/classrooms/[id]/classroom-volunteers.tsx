"use client";

import { useState } from "react";
import { AddVolunteerDialog } from "../../room-parents/add-volunteer-dialog";
import type { ClassroomSummary } from "../../room-parents/classroom-table";
import { buildMoveTargets } from "../../room-parents/move-volunteer-dialog";
import { VolunteerDetails } from "../../room-parents/volunteer-details";

interface Props {
  classroomId: string;
  /** This year's rooms, from `getVolunteerDashboardData` — the Move picker. */
  classrooms: ClassroomSummary[];
  partyTypes: string[];
  roomParentLimit: number;
}

/**
 * A room's volunteers as the Room Parents dashboard shows them — read from the
 * signup rows, so a parent who signed up on paper or by QR code and has never
 * logged in is listed, and can be edited, moved or removed from here.
 */
export function ClassroomVolunteers({
  classroomId,
  classrooms,
  partyTypes,
  roomParentLimit,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const item = classrooms.find((c) => c.classroom.id === classroomId);
  if (!item) return null;

  return (
    <>
      <VolunteerDetails
        classroomId={item.classroom.id}
        classroomName={item.classroom.name}
        gradeLevel={item.classroom.gradeLevel}
        moveTargets={buildMoveTargets(classrooms)}
        roomParents={item.roomParents}
        partyVolunteers={item.partyVolunteers}
        roomParentWaitlist={item.roomParentWaitlist}
        committeeSeats={item.committeeSeats}
        roomParentLimit={roomParentLimit}
        partyTypes={partyTypes}
        onAddVolunteer={() => setAddOpen(true)}
      />
      <AddVolunteerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        classroomId={classroomId}
        classrooms={classrooms.map((c) => c.classroom)}
        partyTypes={partyTypes}
      />
    </>
  );
}
