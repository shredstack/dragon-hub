"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddVolunteerDialog } from "./add-volunteer-dialog";
import { VolunteerDetails } from "./volunteer-details";

interface VolunteerSignup {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "room_parent" | "party_volunteer";
  partyTypes: string[] | null;
  signupSource: "qr_code" | "manual";
  createdAt: Date | null;
}

interface Classroom {
  id: string;
  name: string;
  gradeLevel: string | null;
}

interface ClassroomSummary {
  classroom: Classroom;
  roomParents: VolunteerSignup[];
  partyVolunteers: VolunteerSignup[];
  roomParentCount: number;
  roomParentLimit: number;
  partyVolunteerCounts: Record<string, number>;
}

interface Props {
  classrooms: ClassroomSummary[];
  partyTypes: string[];
  roomParentLimit: number;
}

export function ClassroomTable({ classrooms, partyTypes, roomParentLimit }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(null);

  const handleAddVolunteer = (classroomId: string) => {
    setSelectedClassroomId(classroomId);
    setAddDialogOpen(true);
  };

  const getStatusBadge = (count: number, limit: number) => {
    if (count >= limit) {
      return <Badge variant="success">{count}/{limit}</Badge>;
    } else if (count > 0) {
      return <Badge variant="warning">{count}/{limit}</Badge>;
    } else {
      return <Badge variant="destructive">{count}/{limit}</Badge>;
    }
  };

  // Group by grade level
  const groupedClassrooms = classrooms.reduce(
    (acc, item) => {
      const grade = item.classroom.gradeLevel || "Other";
      if (!acc[grade]) acc[grade] = [];
      acc[grade].push(item);
      return acc;
    },
    {} as Record<string, ClassroomSummary[]>
  );

  const gradeOrder = ["Kindergarten", "K", "1st", "1", "2nd", "2", "3rd", "3", "4th", "4", "5th", "5", "6th", "6", "Other"];
  const sortedGrades = Object.keys(groupedClassrooms).sort(
    (a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b)
  );

  return (
    <div className="space-y-6">
      {sortedGrades.map((grade) => (
        <div key={grade}>
          <h3 className="mb-3 font-medium text-muted-foreground">{grade}</h3>

          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {groupedClassrooms[grade].map((item) => (
              <div
                key={item.classroom.id}
                className="rounded-lg border border-border bg-card"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() =>
                        setExpandedId(
                          expandedId === item.classroom.id ? null : item.classroom.id
                        )
                      }
                    >
                      {item.classroom.name}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddVolunteer(item.classroom.id)}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">Room Parents:</span>
                    {getStatusBadge(item.roomParentCount, roomParentLimit)}
                    {item.roomParents.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({item.roomParents.map((rp) => rp.name.split(" ")[0]).join(", ")})
                      </span>
                    )}
                  </div>
                  {partyTypes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {partyTypes.map((type) => (
                        <span key={type} className="capitalize">
                          {type}: {item.partyVolunteerCounts[type] || 0}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {expandedId === item.classroom.id && (
                  <div className="border-t border-border bg-muted/20 p-4">
                    <VolunteerDetails
                      classroomId={item.classroom.id}
                      classroomName={item.classroom.name}
                      roomParents={item.roomParents}
                      partyVolunteers={item.partyVolunteers}
                      partyTypes={partyTypes}
                      onAddVolunteer={() => handleAddVolunteer(item.classroom.id)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Classroom</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Room Parents</th>
                  {partyTypes.map((type) => (
                    <th key={type} className="px-4 py-3 text-left text-sm font-medium capitalize">
                      {type}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groupedClassrooms[grade].map((item) => (
                  <Fragment key={item.classroom.id}>
                    <tr
                      className={`hover:bg-muted/30 ${expandedId === item.classroom.id ? "bg-muted/50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          className="font-medium hover:underline"
                          onClick={() =>
                            setExpandedId(
                              expandedId === item.classroom.id ? null : item.classroom.id
                            )
                          }
                        >
                          {item.classroom.name}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(item.roomParentCount, roomParentLimit)}
                        {item.roomParents.length > 0 && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            {item.roomParents.map((rp) => rp.name.split(" ")[0]).join(", ")}
                          </span>
                        )}
                      </td>
                      {partyTypes.map((type) => (
                        <td key={type} className="px-4 py-3">
                          <span className="text-sm text-muted-foreground">
                            {item.partyVolunteerCounts[type] || 0}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddVolunteer(item.classroom.id)}
                        >
                          Add
                        </Button>
                      </td>
                    </tr>
                    {expandedId === item.classroom.id && (
                      <tr key={`${item.classroom.id}-details`}>
                        <td colSpan={3 + partyTypes.length} className="bg-muted/20 p-4">
                          <VolunteerDetails
                            classroomId={item.classroom.id}
                            classroomName={item.classroom.name}
                            roomParents={item.roomParents}
                            partyVolunteers={item.partyVolunteers}
                            partyTypes={partyTypes}
                            onAddVolunteer={() => handleAddVolunteer(item.classroom.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <AddVolunteerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        classroomId={selectedClassroomId}
        classrooms={classrooms.map((c) => c.classroom)}
        partyTypes={partyTypes}
      />
    </div>
  );
}
