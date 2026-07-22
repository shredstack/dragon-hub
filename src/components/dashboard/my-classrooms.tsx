import Link from "next/link";
import { MessageCircle, School, UserPlus } from "lucide-react";
import type { ClassroomSummary } from "@/lib/dashboard-data";
import { SectionCard, SectionHeading } from "./section";

/**
 * The user's rooms for the school year currently in session.
 *
 * When there are none, this is the single highest-value prompt on the page —
 * a parent who isn't in a classroom yet is exactly the family the mission is
 * about — so the empty state is an invitation rather than a shrug.
 */
export function MyClassrooms({
  classrooms,
  schoolYear,
}: {
  classrooms: ClassroomSummary[];
  schoolYear: string;
}) {
  return (
    <SectionCard>
      <SectionHeading
        icon={School}
        title="My classrooms"
        tone="green"
        href={classrooms.length ? "/classrooms" : undefined}
      />

      {classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dragon-blue-200 bg-dragon-blue-50 p-4">
          <p className="text-sm font-medium">
            You&apos;re not in a classroom for {schoolYear} yet.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Classroom membership resets each school year. Your room parent or the
            PTA board can add you — or sign up to help with a party or two.
          </p>
          <Link
            href="/profile"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-dragon-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Check my profile
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classrooms.map((classroom) => (
            <Link
              key={classroom.id}
              href={`/classrooms/${classroom.id}`}
              className="rounded-xl border border-border p-4 transition-all hover:-translate-y-0.5 hover:border-dragon-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{classroom.name}</p>
                  {classroom.gradeLevel && (
                    <p className="text-xs text-muted-foreground">
                      {classroom.gradeLevel}
                    </p>
                  )}
                </div>
                <span className="text-lg" aria-hidden>
                  🎒
                </span>
              </div>
              {classroom.recentMessages > 0 && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-dragon-gold-400/20 px-2.5 py-1 text-xs font-semibold text-dragon-gold-700">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {classroom.recentMessages} new this week
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
