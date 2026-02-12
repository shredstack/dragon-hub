"use client";

import { useState } from "react";
import { submitVolunteerSignup } from "@/actions/volunteer-signups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selections, setSelections] = useState<ClassroomSelection[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<
    Array<{ classroomName: string; role: string; success: boolean; error?: string }>
  >([]);

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

  const gradeOrder = [
    "Kindergarten",
    "K",
    "1st",
    "1",
    "2nd",
    "2",
    "3rd",
    "3",
    "4th",
    "4",
    "5th",
    "5",
    "6th",
    "6",
    "Other",
  ];
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || selections.length === 0) {
      return;
    }

    // Validate at least one meaningful selection
    const validSelections = selections.filter(
      (s) => s.isRoomParent || s.partyTypes.length > 0
    );
    if (validSelections.length === 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitVolunteerSignup(qrCode, {
        name,
        email,
        phone: phone || undefined,
        classroomSignups: validSelections,
      });

      setResults(result.results);
      setSubmitted(true);
    } catch (error) {
      console.error("Signup error:", error);
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

        <p className="text-sm text-muted-foreground">
          Check your email ({email}) for your DragonHub login information. You&apos;ll
          be able to access a private message board with your teacher and coordinate
          with other room parents.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Contact Info */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
          />
        </div>
        <div>
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

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

      <Button
        type="submit"
        className="w-full"
        disabled={
          isSubmitting ||
          !name ||
          !email ||
          selections.length === 0 ||
          !selections.some((s) => s.isRoomParent || s.partyTypes.length > 0)
        }
      >
        {isSubmitting ? "Signing Up..." : "Sign Up"}
      </Button>
    </form>
  );
}
