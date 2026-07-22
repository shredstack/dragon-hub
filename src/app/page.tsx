import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, HeartHandshake, Users } from "lucide-react";
import {
  MISSION_STATEMENT,
  MISSION_TAGLINE,
  PTA_MISSION,
  PTA_MISSION_ATTRIBUTION,
} from "@/lib/mission";

/**
 * What each of the three pillars is doing here: the mission is abstract, and a
 * PTA president landing on this page needs to see their own week in it. Each
 * one names a specific chore the app takes off their plate.
 */
const pillars = [
  {
    icon: Users,
    title: "Engaging families",
    body: "A parent scans a QR code and they're in — no account, no email chain, no clipboard to transcribe afterwards.",
  },
  {
    icon: BookOpen,
    title: "Empowering boards",
    body: "Handoff notes, meeting minutes, and past event plans become the guide your successor reads on day one.",
  },
  {
    icon: HeartHandshake,
    title: "Advocating for every child",
    body: "Budgets, calendars, and volunteer needs in one place, so the whole community can see how to help.",
  },
];

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh bg-dragon-blue-900 px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <div className="text-center">
          <Image
            src="/dragon-hub-logo.png"
            alt=""
            width={160}
            height={160}
            priority
            className="mx-auto h-28 w-28 sm:h-40 sm:w-40"
          />
          <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">
            Dragon Hub
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-dragon-gold-300 sm:text-xl">
            {MISSION_TAGLINE}
          </p>
          <Link
            href="/sign-in"
            className="mt-8 inline-block rounded-md bg-dragon-gold-400 px-8 py-3 text-sm font-semibold text-dragon-blue-900 transition-colors hover:bg-dragon-gold-300"
          >
            Sign In
          </Link>
        </div>

        {/* Mission */}
        <div className="mt-14 rounded-lg border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-dragon-gold-300">
            Our mission
          </h2>
          <p className="mt-3 text-base leading-relaxed text-dragon-blue-100 sm:text-lg">
            {MISSION_STATEMENT}
          </p>
          <blockquote className="mt-6 border-l-2 border-dragon-gold-400 pl-4 text-sm italic text-dragon-blue-200">
            The PTA exists &ldquo;{PTA_MISSION}.&rdquo;
            <footer className="mt-1 not-italic text-dragon-blue-300">
              — {PTA_MISSION_ATTRIBUTION}
            </footer>
          </blockquote>
        </div>

        {/* Pillars */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-lg border border-white/10 bg-white/5 p-5"
            >
              <Icon className="h-6 w-6 text-dragon-gold-400" />
              <h3 className="mt-3 font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-dragon-blue-200">
                {body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-dragon-blue-300">
          Already part of a school on DragonHub?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-dragon-gold-300 underline-offset-4 hover:underline"
          >
            Sign in
          </Link>{" "}
          to get started.
        </p>
      </div>
    </div>
  );
}
