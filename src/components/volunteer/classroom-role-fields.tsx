"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClassroomSelect,
  type ClassroomOption,
} from "@/components/classrooms/classroom-select";

export type ClassroomVolunteerRole = "room_parent" | "party_volunteer";

/** One room-level job: the shape `addVolunteerManually` takes per classroom. */
export interface ClassroomSignupDraft {
  classroomId: string;
  role: ClassroomVolunteerRole;
  partyTypes: string[];
}

export const EMPTY_CLASSROOM_SIGNUP: ClassroomSignupDraft = {
  classroomId: "",
  role: "room_parent",
  partyTypes: [],
};

interface Props {
  value: ClassroomSignupDraft;
  onChange: (next: ClassroomSignupDraft) => void;
  classrooms: ClassroomOption[];
  partyTypes: string[];
  idPrefix: string;
  disabled?: boolean;
}

/**
 * Classroom + room parent / party volunteer + which parties, shared by the room
 * parent dashboard's Add dialog and the member directory's Assign roles dialog
 * so the two can't disagree about what a room-level signup is.
 */
export function ClassroomRoleFields({
  value,
  onChange,
  classrooms,
  partyTypes,
  idPrefix,
  disabled,
}: Props) {
  const togglePartyType = (type: string) =>
    onChange({
      ...value,
      partyTypes: value.partyTypes.includes(type)
        ? value.partyTypes.filter((t) => t !== type)
        : [...value.partyTypes, type],
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-classroom`}>Classroom *</Label>
          <ClassroomSelect
            id={`${idPrefix}-classroom`}
            value={value.classroomId}
            onValueChange={(classroomId) => onChange({ ...value, classroomId })}
            classrooms={classrooms}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-role`}>Role *</Label>
          <Select
            value={value.role}
            onValueChange={(role) =>
              onChange({ ...value, role: role as ClassroomVolunteerRole })
            }
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-role`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="room_parent">Room Parent</SelectItem>
              <SelectItem value="party_volunteer">Party Volunteer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {value.role === "party_volunteer" && partyTypes.length > 0 && (
        <div>
          <Label>Party Types</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {partyTypes.map((type) => (
              <label
                key={type}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.partyTypes.includes(type)}
                  onChange={() => togglePartyType(type)}
                  disabled={disabled}
                />
                <span className="capitalize">{type}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
