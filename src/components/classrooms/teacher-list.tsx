import { Badge } from "@/components/ui/badge";
import {
  teacherDisplayName,
  type ClassroomTeacher,
} from "@/lib/classroom-teachers-shared";

interface TeacherListProps {
  teachers: ClassroomTeacher[];
  /**
   * Addresses that haven't been claimed by a signed-in account yet, lowercased.
   * Omit where that distinction isn't the reader's problem — it belongs on the
   * board's admin screens, not on a parent's.
   */
  pendingEmails?: Set<string>;
  /** Print the address under the name. Admin screens want it; parents don't. */
  showEmail?: boolean;
  className?: string;
}

/**
 * A classroom's teachers, one per line.
 *
 * One line each rather than a run-on sentence because each teacher can carry
 * its own "hasn't signed in yet" — the whole point of showing the state at all
 * is knowing *which* address was mistyped.
 */
export function TeacherList({
  teachers,
  pendingEmails,
  showEmail = false,
  className,
}: TeacherListProps) {
  if (teachers.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <ul className={className}>
      {teachers.map((teacher) => {
        const display = teacherDisplayName(teacher);
        const pending = pendingEmails?.has(teacher.email);
        return (
          <li key={teacher.id} className="flex flex-wrap items-center gap-x-2">
            <span>{display}</span>
            {/* Skipped when the name *is* the address — see teacherDisplayName. */}
            {showEmail && display !== teacher.email && (
              <span className="text-muted-foreground">{teacher.email}</span>
            )}
            {pending && (
              <Badge variant="secondary" className="align-middle">
                Hasn&apos;t signed in yet
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
