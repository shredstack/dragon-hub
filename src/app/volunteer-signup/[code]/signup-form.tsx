"use client";

import { useState } from "react";
import { submitVolunteerSignup } from "@/actions/volunteer-signups";
import type {
  InterestLevel,
  PublicCampaign,
} from "@/actions/volunteer-campaigns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ContactFields,
  useContactFields,
} from "@/components/volunteer/contact-fields";
import { EventInterestPicker } from "@/components/volunteer/event-interest-picker";
import { EligibilityNotice } from "@/components/volunteer/eligibility-notice";
import type { VolunteerEligibilityInfo } from "@/lib/volunteer-eligibility";
import { GRADE_LEVELS } from "@/lib/constants";

interface Classroom {
  id: string;
  name: string;
  gradeLevel: string | null;
  roomParentCount: number;
  roomParentLimit: number;
}

interface Props {
  qrCode: string;
  schoolName: string;
  classrooms: Classroom[];
  partyTypes: string[];
  roomParentLimit: number;
  /** General-PTA events shown below the classroom section, when configured. */
  addonCampaign?: PublicCampaign | null;
  /** District volunteer-application reminder for the confirmation screen. */
  eligibility?: VolunteerEligibilityInfo | null;
}

interface ClassroomSelection {
  classroomId: string;
  isRoomParent: boolean;
  partyTypes: string[];
}

export function VolunteerSignupForm({
  qrCode,
  schoolName,
  classrooms,
  partyTypes,
  roomParentLimit,
  addonCampaign,
  eligibility = null,
}: Props) {
  const contact = useContactFields();
  const [selections, setSelections] = useState<ClassroomSelection[]>([]);
  const [eventInterest, setEventInterest] = useState<Record<string, InterestLevel>>(
    {}
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<
    Array<{ classroomName: string; role: string; success: boolean; error?: string }>
  >([]);
  const [interestedEvents, setInterestedEvents] = useState<string[]>([]);

  // Group classrooms by grade level
  const groupedClassrooms = classrooms.reduce(
    (acc, classroom) => {
      const grade = classroom.gradeLevel || "Other";
      if (!acc[grade]) acc[grade] = [];
      acc[grade].push(classroom);
      return acc;
    },
    {} as Record<string, Classroom[]>
  );

  // Use GRADE_LEVELS constant for consistent ordering, with "Other" at the end
  const gradeOrder = [...GRADE_LEVELS, "Other"];
  const sortedGrades = Object.keys(groupedClassrooms).sort(
    (a, b) => gradeOrder.indexOf(a) - gradeOrder.indexOf(b)
  );

  const toggleClassroom = (classroomId: string) => {
    setSelections((prev) => {
      const exists = prev.find((s) => s.classroomId === classroomId);
      if (exists) {
        return prev.filter((s) => s.classroomId !== classroomId);
      }
      return [...prev, { classroomId, isRoomParent: false, partyTypes: [] }];
    });
  };

  const updateSelection = (classroomId: string, update: Partial<ClassroomSelection>) => {
    setSelections((prev) =>
      prev.map((s) => (s.classroomId === classroomId ? { ...s, ...update } : s))
    );
  };

  const togglePartyType = (classroomId: string, partyType: string) => {
    setSelections((prev) =>
      prev.map((s) => {
        if (s.classroomId !== classroomId) return s;
        const types = s.partyTypes.includes(partyType)
          ? s.partyTypes.filter((t) => t !== partyType)
          : [...s.partyTypes, partyType];
        return { ...s, partyTypes: types };
      })
    );
  };

  const toggleEventInterest = (eventId: string) => {
    setEventInterest((prev) => {
      if (prev[eventId]) {
        const next = { ...prev };
        delete next[eventId];
        return next;
      }
      return { ...prev, [eventId]: "interested" };
    });
  };

  const classroomSelections = selections.filter(
    (s) => s.isRoomParent || s.partyTypes.length > 0
  );
  const eventSelections = Object.entries(eventInterest).map(
    ([campaignEventId, interestLevel]) => ({ campaignEventId, interestLevel })
  );
  // Either half of the page is enough to submit — a parent with no kids in a
  // listed classroom can still say they'll help at the Fun Run.
  const hasSomethingToSubmit =
    classroomSelections.length > 0 || eventSelections.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contact.isComplete || !hasSomethingToSubmit) {
      return;
    }

    if (!contact.validate()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitVolunteerSignup(qrCode, {
        name: contact.value.name,
        email: contact.value.email,
        phone: contact.value.phone || undefined,
        classroomSignups: classroomSelections,
        ...(addonCampaign &&
          eventSelections.length > 0 && {
            campaign: {
              campaignId: addonCampaign.id,
              selections: eventSelections,
            },
          }),
      });

      if (result.error) {
        setSubmitError(result.error);
        return;
      }

      setResults(result.results);
      setInterestedEvents(result.interestedEvents);
      setSubmitted(true);
    } catch (error) {
      console.error("Signup error:", error);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show multi-class room parent warning
  const multiRoomParentWarning =
    selections.filter((s) => s.isRoomParent).length > 1;

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">🎉</div>
        <h3 className="text-xl font-semibold">You&apos;re all set!</h3>
        <p className="text-muted-foreground">
          Thank you for volunteering at {schoolName}! Here&apos;s what you signed up for:
        </p>

        <div className="mx-auto max-w-sm space-y-2 text-left">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg border p-3 ${
                r.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
              }`}
            >
              <span>{r.success ? "✓" : "✕"}</span>
              <div>
                <div className="font-medium">{r.classroomName}</div>
                <div className="text-sm text-muted-foreground">
                  {r.role}
                  {r.error && !r.success && ` - ${r.error}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        {interestedEvents.length > 0 && (
          <div className="mx-auto max-w-sm space-y-2 text-left">
            <div className="text-sm font-medium">
              You also told us you&apos;re interested in:
            </div>
            {interestedEvents.map((title) => (
              <div
                key={title}
                className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3"
              >
                <span>✓</span>
                <div className="font-medium">{title}</div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              This isn&apos;t a commitment — we&apos;ll reach out closer to each
              event when we know what help we need.
            </p>
          </div>
        )}

        <EligibilityNotice eligibility={eligibility} />

        <p className="text-sm text-muted-foreground">
          Check your email ({contact.value.email}) — the welcome message has a
          button that takes you straight into DragonHub, no password needed. From
          there you&apos;ll have a private message board with your teacher and can
          coordinate with other room parents.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Contact Info */}
      <ContactFields {...contact.fieldProps} />

      {/* Classroom Selection */}
      <div>
        <Label className="mb-3 block text-base font-medium">
          Select Classroom(s) *
        </Label>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose the classroom(s) for your child(ren).
        </p>

        <div className="space-y-4">
          {sortedGrades.map((grade) => (
            <div key={grade}>
              <div className="mb-2 text-sm font-medium text-muted-foreground">
                {grade}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {groupedClassrooms[grade].map((classroom) => {
                  const isSelected = selections.some(
                    (s) => s.classroomId === classroom.id
                  );
                  const selection = selections.find(
                    (s) => s.classroomId === classroom.id
                  );
                  const roomParentFull =
                    classroom.roomParentCount >= classroom.roomParentLimit;

                  return (
                    <div
                      key={classroom.id}
                      className={`rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? "border-dragon-blue-500 bg-dragon-blue-50"
                          : "border-border hover:border-dragon-blue-300"
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleClassroom(classroom.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{classroom.name}</div>
                        </div>
                      </label>

                      {isSelected && (
                        <div className="ml-6 mt-3 space-y-3">
                          {/* Room Parent option */}
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selection?.isRoomParent || false}
                              onChange={(e) =>
                                updateSelection(classroom.id, {
                                  isRoomParent: e.target.checked,
                                })
                              }
                              disabled={roomParentFull && !selection?.isRoomParent}
                              className="mt-1"
                            />
                            <div>
                              <span className="font-medium">Room Parent</span>
                              <span
                                className={`ml-2 text-xs ${
                                  roomParentFull
                                    ? "text-red-600"
                                    : "text-muted-foreground"
                                }`}
                              >
                                ({classroom.roomParentCount}/{roomParentLimit}{" "}
                                {roomParentFull ? "full" : "spots filled"})
                              </span>
                            </div>
                          </label>

                          {/* Party Volunteer options */}
                          <div>
                            <div className="mb-1 text-sm font-medium">
                              Party Volunteer
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {partyTypes.map((type) => (
                                <label
                                  key={type}
                                  className="flex items-center gap-1 text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      selection?.partyTypes.includes(type) || false
                                    }
                                    onChange={() =>
                                      togglePartyType(classroom.id, type)
                                    }
                                  />
                                  <span className="capitalize">{type}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* General PTA event interest — secondary to room parents above, so it
          sits below the classroom section and is visually separated. */}
      {addonCampaign && (
        <div className="border-t border-border pt-6">
          <Label className="mb-1 block text-base font-medium">
            {addonCampaign.title}
          </Label>
          <p className="mb-1 text-sm text-muted-foreground">
            {addonCampaign.intro ??
              "Interested in helping with anything else this year? Check any that sound good — this is not a commitment."}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Optional. We&apos;ll only use this to know who to ask when we need
            help.
          </p>

          <EventInterestPicker
            events={addonCampaign.events}
            selections={eventInterest}
            onToggle={toggleEventInterest}
            onLevelChange={(eventId, level) =>
              setEventInterest((prev) => ({ ...prev, [eventId]: level }))
            }
          />
        </div>
      )}

      {/* Multi-class room parent warning */}
      {multiRoomParentWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="flex items-start gap-2">
            <span>⚠️</span>
            <p className="text-amber-800">
              <strong>Please note:</strong> Class party times are scheduled by
              teachers and may overlap. Signing up as room parent for multiple
              classes means you&apos;ll help organize all parties, but you may need
              to choose which party to physically attend if times conflict.
            </p>
          </div>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || !contact.isComplete || !hasSomethingToSubmit}
      >
        {isSubmitting ? "Signing Up..." : "Sign Up"}
      </Button>
    </form>
  );
}
