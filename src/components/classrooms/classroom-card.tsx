import Link from "next/link";
import { School, Users } from "lucide-react";

interface ClassroomCardProps {
  classroom: { id: string; name: string; gradeLevel: string | null; schoolYear: string };
  memberCount: number;
  teacherName?: string;
}

export function ClassroomCard({ classroom, memberCount, teacherName }: ClassroomCardProps) {
  return (
    <Link
      href={`/classrooms/${classroom.id}`}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-all hover:border-dragon-blue-400 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-dragon-blue-100 text-dragon-blue-600">
          <School className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold group-hover:text-dragon-blue-600">{classroom.name}</h3>
          {classroom.gradeLevel && <p className="text-sm text-muted-foreground">{classroom.gradeLevel}</p>}
        </div>
      </div>
      {teacherName && <p className="text-sm text-muted-foreground">Teacher: {teacherName}</p>}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{memberCount} {memberCount === 1 ? "member" : "members"}</span>
      </div>
    </Link>
  );
}
