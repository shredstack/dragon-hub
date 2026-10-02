"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ClassroomOption {
  id: string;
  name: string;
  gradeLevel: string | null;
}

interface Props {
  id?: string;
  value: string;
  onValueChange: (classroomId: string) => void;
  classrooms: ClassroomOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Extra text after a room's name — e.g. seats filled, "— 1/2". */
  detail?: (classroom: ClassroomOption) => string;
}

/** "Room 12 (2nd Grade)" — the one way the board's add dialogs list rooms. */
export function ClassroomSelect({
  id,
  value,
  onValueChange,
  classrooms,
  placeholder = "Select classroom",
  disabled,
  detail,
}: Props) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {classrooms.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {c.gradeLevel ? ` (${c.gradeLevel})` : ""}
            {detail?.(c) ?? ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
