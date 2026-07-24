"use client";

import Image from "next/image";
import type { PublicCommittee } from "@/actions/committees";
import {
  committeeCapacityLine,
  committeeCapacityState,
} from "./committee-capacity";
import { isAtCapacity } from "@/lib/waitlist-shared";

/**
 * The committee checklist appended to the room parent signup page.
 *
 * Same visual language as `EventInterestPicker` on purpose — a parent scanning
 * one QR code at Back to School Night works down a single page, and three
 * sections that look like three different apps is how people give up halfway.
 *
 * Checking a committee reveals the "would you chair this?" question inline,
 * rather than asking it up front on every card.
 */

export interface CommitteeSelection {
  committeeId: string;
  willingToChair: boolean;
}

interface Props {
  committees: PublicCommittee[];
  /** Committee id → selection. Absent means not selected. */
  selections: Record<string, CommitteeSelection>;
  onToggle: (committeeId: string) => void;
  onChairChange: (committeeId: string, willingToChair: boolean) => void;
}

export function CommitteePicker({
  committees,
  selections,
  onToggle,
  onChairChange,
}: Props) {
  return (
    <div className="space-y-3">
      {committees.map((committee) => {
        const selection = selections[committee.id];
        const isSelected = !!selection;
        const isFull = isAtCapacity(committeeCapacityState(committee));

        return (
          <div
            key={committee.id}
            className={`rounded-lg border transition-colors ${
              isSelected
                ? "border-dragon-blue-500 bg-dragon-blue-50"
                : "border-border hover:border-dragon-blue-300"
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <input
                id={`committee-${committee.id}`}
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(committee.id)}
                className="mt-1 shrink-0"
              />

              <CommitteeIcon committee={committee} />

              <div className="min-w-0 flex-1">
                {/* The label covers the header only — the disclosure below sits
                    outside it, since activating anything inside a label toggles
                    its checkbox. */}
                <label
                  htmlFor={`committee-${committee.id}`}
                  className="block cursor-pointer"
                >
                  <span className="font-medium">{committee.name}</span>
                  {isFull && (
                    <span className="ml-2 text-xs font-medium text-amber-700">
                      Full — join the waitlist
                    </span>
                  )}

                  {(committee.typicalTiming || committee.timeCommitment) && (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {committee.typicalTiming && (
                        <span>📅 {committee.typicalTiming}</span>
                      )}
                      {committee.timeCommitment && (
                        <span>⏱ {committee.timeCommitment}</span>
                      )}
                    </span>
                  )}

                  {committee.description && (
                    <span className="mt-2 block text-sm text-muted-foreground">
                      {committee.description}
                    </span>
                  )}

                  <span className="mt-2 block text-xs text-muted-foreground">
                    {committeeCapacityLine(committee)}
                  </span>
                </label>

                {committee.responsibilities && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-dragon-blue-600">
                      What volunteers do
                    </summary>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {committee.responsibilities}
                    </p>
                  </details>
                )}
              </div>
            </div>

            {isSelected && (
              <div className="border-t border-dragon-blue-200 px-4 py-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selection.willingToChair}
                    onChange={(e) =>
                      onChairChange(committee.id, e.target.checked)
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">
                      I&apos;d be willing to help chair this
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Not a commitment — it just tells the board who to talk to.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CommitteeIcon({ committee }: { committee: PublicCommittee }) {
  if (committee.imageUrl) {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
        <Image
          src={committee.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="48px"
          unoptimized
        />
      </div>
    );
  }

  if (committee.iconEmoji) {
    return (
      <div
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl"
      >
        {committee.iconEmoji}
      </div>
    );
  }

  return null;
}
