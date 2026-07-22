import Link from "next/link";
import { Flame, Plus } from "lucide-react";
import { MISSION_TAGLINE } from "@/lib/mission";

interface DashboardHeroProps {
  name?: string | null;
  schoolName: string;
  /** "Dragons", "Wildcats" — whatever this school calls its kids. */
  mascot?: string | null;
  schoolYear: string;
  myApprovedHours: number;
  schoolApprovedHours: number;
}

/**
 * The banner, and the only place on the dashboard that talks about *why*.
 *
 * The number that leads is hours given by the whole school, not a count of the
 * user's outstanding chores — the mission is that families showing up is what
 * turns into something for the kids, so the headline is the community's total
 * and the user's own contribution sits inside it. A parent with zero hours gets
 * an invitation instead of a zero.
 */
export function DashboardHero({
  name,
  schoolName,
  mascot,
  schoolYear,
  myApprovedHours,
  schoolApprovedHours,
}: DashboardHeroProps) {
  const firstName = name?.trim().split(/\s+/)[0];
  const kids = mascot?.trim() || "kids";
  const schoolHours = formatHours(schoolApprovedHours);
  const myHours = formatHours(myApprovedHours);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dragon-blue-600 via-dragon-blue-500 to-dragon-blue-700 p-6 text-white shadow-sm sm:p-8">
      {/* Decorative warmth. Hidden from assistive tech — it says nothing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-dragon-gold-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-dragon-blue-300/20 blur-3xl"
      />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
            {schoolName}
          </span>
          <span className="rounded-full bg-dragon-gold-400/25 px-2.5 py-1 text-xs font-medium text-dragon-gold-100">
            {schoolYear}
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
          {firstName ? `Hi, ${firstName}!` : "Welcome back!"} 👋
        </h1>

        {schoolApprovedHours > 0 ? (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-dragon-blue-100 sm:text-base">
            Families here have given{" "}
            <span className="font-bold text-dragon-gold-300">
              {schoolHours} hours
            </span>{" "}
            to our {kids} this year
            {myApprovedHours > 0 ? (
              <>
                {" "}
                — <span className="font-semibold text-white">
                  {myHours} of them yours
                </span>
                . Thank you.
              </>
            ) : (
              <>. There&apos;s room for yours.</>
            )}
          </p>
        ) : (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-dragon-blue-100 sm:text-base">
            The {schoolYear} year is just getting started. Every hour logged here
            is an hour a {singular(kids)} gets.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href="/volunteer-hours/submit"
            className="inline-flex items-center gap-1.5 rounded-full bg-dragon-gold-400 px-4 py-2 text-sm font-semibold text-dragon-blue-900 transition-transform hover:scale-[1.03]"
          >
            <Plus className="h-4 w-4" />
            Log volunteer hours
          </Link>
          <p className="inline-flex items-center gap-1.5 text-xs text-dragon-blue-200">
            <Flame className="h-3.5 w-3.5 text-dragon-gold-300" />
            {MISSION_TAGLINE}
          </p>
        </div>
      </div>
    </div>
  );
}

/** 12.5 stays 12.5; 12.0 becomes 12. Nobody says "twelve point zero hours." */
function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** "Dragons" → "Dragon", so the singular sentence doesn't read wrong. */
function singular(word: string): string {
  return word.endsWith("s") ? word.slice(0, -1) : word;
}
