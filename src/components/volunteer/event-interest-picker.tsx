"use client";

import Image from "next/image";
import type {
  InterestLevel,
  PublicCampaignEvent,
} from "@/actions/volunteer-campaigns";

/**
 * The event list on a volunteer interest campaign page.
 *
 * Leans visual on purpose — an emoji or photo per event is the difference
 * between a parent skimming past "Chinese New Year Assembly" and stopping on
 * "🐉 Chinese New Year Assembly". Details sit behind a disclosure so the list
 * stays scannable on a phone at Back to School Night.
 */

interface Props {
  events: PublicCampaignEvent[];
  /** Event id → chosen level. Absent means not selected. */
  selections: Record<string, InterestLevel>;
  onToggle: (eventId: string) => void;
  onLevelChange: (eventId: string, level: InterestLevel) => void;
}

export function EventInterestPicker({
  events,
  selections,
  onToggle,
  onLevelChange,
}: Props) {
  return (
    <div className="space-y-3">
      {events.map((event) => {
        const level = selections[event.id];
        const isSelected = !!level;

        return (
          <div
            key={event.id}
            className={`rounded-lg border transition-colors ${
              isSelected
                ? "border-dragon-blue-500 bg-dragon-blue-50"
                : "border-border hover:border-dragon-blue-300"
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <input
                id={`event-${event.id}`}
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(event.id)}
                className="mt-1 shrink-0"
              />

              <EventIcon event={event} />

              <div className="min-w-0 flex-1">
                {/* The label covers the header only. The disclosure and the
                    SignUpGenius link sit outside it — activating anything
                    inside a label toggles its checkbox. */}
                <label
                  htmlFor={`event-${event.id}`}
                  className="block cursor-pointer"
                >
                  <span className="font-medium">{event.title}</span>

                  {(event.typicalTiming || event.timeCommitment) && (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {event.typicalTiming && <span>📅 {event.typicalTiming}</span>}
                      {event.timeCommitment && <span>⏱ {event.timeCommitment}</span>}
                    </span>
                  )}

                  {event.description && (
                    <span className="mt-2 block text-sm text-muted-foreground">
                      {event.description}
                    </span>
                  )}
                </label>

                {event.volunteerResponsibilities && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-dragon-blue-600">
                      What volunteers do
                    </summary>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {event.volunteerResponsibilities}
                    </p>
                  </details>
                )}

                {event.signupGeniusUrl && (
                  <a
                    href={event.signupGeniusUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm font-medium text-dragon-blue-600 underline"
                  >
                    Time slots are open — sign up for one →
                  </a>
                )}
              </div>
            </div>

            {isSelected && (
              <div className="border-t border-dragon-blue-200 px-4 py-3">
                <div className="mb-2 text-sm font-medium">How involved?</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                  <LevelOption
                    eventId={event.id}
                    level="interested"
                    current={level}
                    onChange={onLevelChange}
                    label="Count me in to help"
                    hint="We'll reach out when we need hands"
                  />
                  <LevelOption
                    eventId={event.id}
                    level="lead"
                    current={level}
                    onChange={onLevelChange}
                    label="I'd like to help lead"
                    hint="Help plan and run the event"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventIcon({ event }: { event: PublicCampaignEvent }) {
  if (event.imageUrl) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
        <Image
          src={event.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="48px"
          unoptimized
        />
      </div>
    );
  }

  if (event.iconEmoji) {
    return (
      <div
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl"
      >
        {event.iconEmoji}
      </div>
    );
  }

  return null;
}

function LevelOption({
  eventId,
  level,
  current,
  onChange,
  label,
  hint,
}: {
  eventId: string;
  level: InterestLevel;
  current: InterestLevel;
  onChange: (eventId: string, level: InterestLevel) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input
        type="radio"
        name={`level-${eventId}`}
        checked={current === level}
        onChange={() => onChange(eventId, level)}
        className="mt-1"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
