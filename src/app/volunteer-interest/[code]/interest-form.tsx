"use client";

import { useState } from "react";
import {
  submitCampaignInterest,
  type InterestLevel,
  type PublicCampaign,
} from "@/actions/volunteer-campaigns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ContactFields,
  useContactFields,
} from "@/components/volunteer/contact-fields";
import { EventInterestPicker } from "@/components/volunteer/event-interest-picker";
import { EligibilityNotice } from "@/components/volunteer/eligibility-notice";

interface Props {
  qrCode: string;
  schoolName: string;
  campaign: PublicCampaign;
}

export function InterestForm({ qrCode, schoolName, campaign }: Props) {
  const contact = useContactFields();
  const [selections, setSelections] = useState<Record<string, InterestLevel>>({});
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedEvents, setSavedEvents] = useState<string[] | null>(null);

  const toggle = (eventId: string) => {
    setSelections((prev) => {
      if (prev[eventId]) {
        const next = { ...prev };
        delete next[eventId];
        return next;
      }
      return { ...prev, [eventId]: "interested" };
    });
  };

  const selectedCount = Object.keys(selections).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contact.isComplete || selectedCount === 0) return;
    if (!contact.validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitCampaignInterest(qrCode, {
        name: contact.value.name,
        email: contact.value.email,
        phone: contact.value.phone || undefined,
        notes: notes || undefined,
        selections: Object.entries(selections).map(
          ([campaignEventId, interestLevel]) => ({
            campaignEventId,
            interestLevel,
          })
        ),
      });

      if (!result.success) {
        setSubmitError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSavedEvents(result.savedEventTitles);
    } catch (error) {
      console.error("Interest signup error:", error);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (savedEvents) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">🎉</div>
        <h3 className="text-xl font-semibold">Thank you!</h3>
        <p className="text-muted-foreground">
          {schoolName} PTA has your info. Here&apos;s what you told us
          you&apos;re interested in:
        </p>

        <div className="mx-auto max-w-sm space-y-2 text-left">
          {savedEvents.map((title) => (
            <div
              key={title}
              className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3"
            >
              <span>✓</span>
              <div className="font-medium">{title}</div>
            </div>
          ))}
        </div>

        <EligibilityNotice eligibility={campaign.eligibility} />

        <p className="text-sm text-muted-foreground">
          Check your email ({contact.value.email}) — the welcome message has a
          button that takes you straight into DragonHub, no password needed.
          You&apos;ll hear from us when sign-ups open for these events.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ContactFields {...contact.fieldProps} />

      <div>
        <Label className="mb-1 block text-base font-medium">
          Which events interest you? *
        </Label>
        <p className="mb-3 text-sm text-muted-foreground">
          Check any that sound good — pick as many as you like.
        </p>

        <EventInterestPicker
          events={campaign.events}
          selections={selections}
          onToggle={toggle}
          onLevelChange={(eventId, level) =>
            setSelections((prev) => ({ ...prev, [eventId]: level }))
          }
        />
      </div>

      <div>
        <Label htmlFor="notes">Anything we should know?</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Skills you'd like to use, days that work best, kids' grades..."
          rows={3}
        />
      </div>

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || !contact.isComplete || selectedCount === 0}
      >
        {isSubmitting
          ? "Submitting..."
          : selectedCount > 0
            ? `Count Me In (${selectedCount})`
            : "Count Me In"}
      </Button>
    </form>
  );
}
