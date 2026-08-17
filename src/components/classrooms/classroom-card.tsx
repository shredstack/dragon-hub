import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClassroomIcon } from "@/components/classrooms/classroom-icon";
import { DliBadge } from "@/components/classrooms/dli-badge";
import { formatTeacherNames } from "@/lib/classroom-teachers-shared";

interface ClassroomCardProps {
  classroom: {
    id: string;
    name: string;
    gradeLevel: string | null;
    schoolYear: string;
    /**
     * The room's own emoji, picked by someone in it. Null until then, which is
     * what the generic school icon means — see `ClassroomIcon`.
     */
    iconEmoji?: string | null;
    isDli?: boolean | null;
    /** The strand the board configured, e.g. "Blue — English Homeroom". */
    dliGroupName?: string | null;
    dliGroupColor?: string | null;
  };
  memberCount: number;
  /**
   * The room's teachers, in the board's order. A half-day room has two, so this
   * is a list and the label pluralizes. Addresses stay off a parent-facing card
   * — a name is what a parent is looking for.
   */
  teachers?: Array<{ name: string | null; email: string }>;
  /**
   * Why this room is on someone's page when they never joined it — the name of
   * their own DLI room, whose grade partner this is. Without it, a Blue room
   * parent just finds the Red room sitting in their list unexplained.
   */
  partnerOfName?: string;
}

export function ClassroomCard({
  classroom,
  memberCount,
  teachers = [],
  partnerOfName,
}: ClassroomCardProps) {
  return (
    <Link
      href={`/classrooms/${classroom.id}`}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all hover:border-dragon-blue-400 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <ClassroomIcon iconEmoji={classroom.iconEmoji} />
        <div>
          <h3 className="font-semibold group-hover:text-dragon-blue-600">{classroom.name}</h3>
          {classroom.gradeLevel && <p className="text-sm text-muted-foreground">{classroom.gradeLevel}</p>}
        </div>
      </div>
      {teachers.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {teachers.length === 1 ? "Teacher" : "Teachers"}:{" "}
          {formatTeacherNames(teachers)}
        </p>
      )}
      {(classroom.isDli || partnerOfName) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* "DLI" and the strand are two separate facts — a parent looking for
              their room recognizes "Blue", while "DLI" is what tells them why
              the grade has two rooms at all — so they get two pills. The strand
              badge is only rendered when there is one; DliBadge's own fallback
              would otherwise repeat "DLI". */}
          {classroom.isDli && <Badge variant="secondary">DLI</Badge>}
          {classroom.isDli && classroom.dliGroupName && (
            <DliBadge
              isDli={classroom.isDli}
              groupName={classroom.dliGroupName}
              groupColor={classroom.dliGroupColor}
            />
          )}
          {partnerOfName && (
            <Badge variant="outline">DLI partner of {partnerOfName}</Badge>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{memberCount} {memberCount === 1 ? "member" : "members"}</span>
      </div>
    </Link>
  );
}
