"use client";

import { useState } from "react";
import { joinCommittee, type PublicCommittee } from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ContactFields,
  useContactFields,
} from "@/components/volunteer/contact-fields";
import { EligibilityNotice } from "@/components/volunteer/eligibility-notice";
import { CommitteeCapacityLine } from "@/components/volunteer/committee-capacity";

interface Props {
  joinCode: string;
  committee: PublicCommittee;
}

export function CommitteeJoinForm({ joinCode, committee }: Props) {
  const contact = useContactFields();
  const [willingToChair, setWillingToChair] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    waitlisted: boolean;
    position?: number;
  } | null>(null);

  const isFull =
    committee.capacityMode === "capped" &&
    committee.maxSize !== null &&
    committee.memberCount >= committee.maxSize;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.isComplete || !contact.validate()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await joinCommittee(joinCode, {
        name: contact.value.name,
        email: contact.value.email,
        phone: contact.value.phone || undefined,
        willingToChair,
        notes: notes || undefined,
      });

      if (!response.success) {
        setError(response.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResult({
        waitlisted: !!response.waitlisted,
        position: response.waitlistPosition,
      });
    } catch (err) {
      console.error("Committee join error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // A committee that filled up with no waitlist is the one dead end. Say so
  // plainly and give them a person to email rather than a form that can't work.
  if (committee.isClosedToNewMembers) {
    return (
      <div className="space-y-3 text-center">
        <div className="text-3xl">🙌</div>
        <p className="font-medium">This committee is full.</p>
        <p className="text-sm text-muted-foreground">
          {committee.contactEmail ? (
            <>
              Contact{" "}
              <a
                href={`mailto:${committee.contactEmail}`}
                className="font-medium text-dragon-blue-600 underline"
              >
                {committee.contactEmail}
              </a>{" "}
              if you&apos;d still like to help.
            </>
          ) : (
            "Get in touch with the PTA if you'd still like to help."
          )}
        </p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">{result.waitlisted ? "📋" : "🎉"}</div>
        <h2 className="text-xl font-semibold">
          {result.waitlisted ? "You're on the waitlist" : "You're on the team!"}
        </h2>
        <p className="text-muted-foreground">
          {result.waitlisted ? (
            <>
              {committee.name} is full, so you&apos;re{" "}
              <strong>#{result.position}</strong> on the waitlist. We&apos;ll email
              you the moment a spot opens.
            </>
          ) : (
            <>
              Thanks for joining {committee.name} at {committee.schoolName}.
            </>
          )}
        </p>

        <EligibilityNotice eligibility={committee.eligibility} />

        <p className="text-sm text-muted-foreground">
          Check your email ({contact.value.email}) — the welcome message has a
          button that takes you straight into DragonHub, no password needed.
          {!result.waitlisted &&
            " From there you'll find the committee's message board and task list."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <CommitteeCapacityLine committee={committee} />

      <ContactFields {...contact.fieldProps} />

      <div>
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={willingToChair}
            onChange={(e) => setWillingToChair(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-medium">
              Willing to help chair this committee?
            </span>
            <span className="block text-xs text-muted-foreground">
              Not a commitment — it just tells the board who to talk to.
            </span>
          </span>
        </label>
      </div>

      <div>
        <Label htmlFor="committee-notes">
          Anything you&apos;d especially like to help with?
        </Label>
        <Textarea
          id="committee-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="I can help with photography"
          rows={2}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || !contact.isComplete}
      >
        {isSubmitting
          ? "Signing up…"
          : isFull
            ? "Join the waitlist"
            : "Join the committee"}
      </Button>
    </form>
  );
}
