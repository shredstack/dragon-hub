"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  GraduationCap,
  BookOpen,
  CheckSquare,
  FileText,
  Calendar,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { OnboardingChecklist } from "./onboarding-checklist";
import { OnboardingResources } from "./onboarding-resources";
import { getOnboardingProgressSummary } from "@/actions/onboarding-checklist";
import type { PtaBoardPosition } from "@/types";

interface OnboardingDashboardProps {
  position?: PtaBoardPosition;
  positionLabel?: string;
  hasGuide: boolean;
  hasHandoffNote: boolean;
  handoffFromName?: string;
}

export function OnboardingDashboard({
  position,
  positionLabel,
  hasGuide,
  hasHandoffNote,
  handoffFromName,
}: OnboardingDashboardProps) {
  const [progressSummary, setProgressSummary] = useState<{
    totalItems: number;
    completedItems: number;
    percentComplete: number;
  } | null>(null);

  useEffect(() => {
    getOnboardingProgressSummary().then(setProgressSummary);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-dragon-blue-500/10 p-2 text-dragon-blue-500">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Board Onboarding</h1>
            {positionLabel && (
              <p className="text-sm text-muted-foreground">
                Welcome to your role as {positionLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      {progressSummary && progressSummary.totalItems > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Onboarding Progress
              </p>
              <p className="text-2xl font-bold">
                {progressSummary.completedItems} / {progressSummary.totalItems}{" "}
                tasks complete
              </p>
            </div>
            <div className="relative h-16 w-16">
              <svg
                className="h-16 w-16 -rotate-90 transform"
                viewBox="0 0 36 36"
              >
                <path
                  className="text-muted/20"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-dragon-blue-500"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${progressSummary.percentComplete}, 100`}
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-medium">
                {progressSummary.percentComplete}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Access Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* AI Guide Card */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">AI Onboarding Guide</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasGuide
                  ? "Your personalized guide is ready"
                  : "Generate a personalized guide for your role"}
              </p>
              <Link
                href="/onboarding/guide"
                className="mt-2 inline-flex items-center text-sm font-medium text-purple-500 hover:text-purple-600"
              >
                {hasGuide ? "View Guide" : "Generate Guide"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Handoff Note Card */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">Handoff Notes</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasHandoffNote
                  ? `Notes from ${handoffFromName || "your predecessor"}`
                  : "No handoff notes available yet"}
              </p>
              {hasHandoffNote ? (
                <Link
                  href="/onboarding/handoff"
                  className="mt-2 inline-flex items-center text-sm font-medium text-amber-500 hover:text-amber-600"
                >
                  Read Notes
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              ) : (
                <Link
                  href="/onboarding/handoff"
                  className="mt-2 inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Create Handoff
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Event Catalog Card */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">Event Catalog</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse events you can lead this year
              </p>
              <Link
                href="/onboarding/events"
                className="mt-2 inline-flex items-center text-sm font-medium text-green-500 hover:text-green-600"
              >
                Browse Events
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Checklist Section */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Onboarding Checklist</h2>
          </div>
          <OnboardingChecklist position={position} />
        </div>

        {/* Resources Section */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Resources</h2>
          </div>
          <OnboardingResources position={position} />
        </div>
      </div>
    </div>
  );
}
