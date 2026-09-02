import { cache } from "react";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * How a school signs an event plan off and closes it out.
 *
 * Stored in one jsonb column on `schools`, following the `moduleVisibility` /
 * `eventDirectorySettings` precedent: **a missing column and a missing key both
 * mean the default**, so there is no backfill and no migration when a third
 * knob appears. Read it through `getEventPlanSettings()` rather than poking at
 * the JSON — the defaults are the interesting part, and every school has an
 * empty column until it opens the settings screen.
 *
 * Both keys exist because approval used to be two hard-coded constants' worth
 * of policy that no school could see or change: a plan needed two board votes,
 * and nothing ever moved a plan out of Pending. The result was a page full of
 * events that had already happened still describing themselves as being
 * planned.
 */
export interface EventPlanSettings {
  /**
   * Board approvals a plan needs before its status becomes `approved`.
   *
   * One by default. A PTA approving its own Field Day plan is a sign-off, not a
   * quorum, and requiring a second board member is how a plan sits in Pending
   * until the event has already run. A school that wants two signatures — or
   * three — sets it here.
   */
  approvalThreshold: number;
  /**
   * Close a plan out on its own once its event date has passed.
   *
   * On by default. See `src/lib/event-plan-autocomplete.ts` for exactly which
   * plans it touches; the short version is that it never completes a draft.
   */
  autoCompletePastEvents: boolean;
}

/** The most approvals a school can demand. Above this it's a committee vote. */
export const MAX_APPROVAL_THRESHOLD = 5;

export const EVENT_PLAN_SETTINGS_DEFAULTS: EventPlanSettings = {
  approvalThreshold: 1,
  autoCompletePastEvents: true,
};

/** The stored shape — every key optional, because absence means the default. */
export type StoredEventPlanSettings = Partial<EventPlanSettings>;

export function resolveEventPlanSettings(
  stored: StoredEventPlanSettings | null | undefined
): EventPlanSettings {
  const merged = { ...EVENT_PLAN_SETTINGS_DEFAULTS, ...(stored ?? {}) };
  return { ...merged, approvalThreshold: clampThreshold(merged.approvalThreshold) };
}

/**
 * A threshold of zero would approve a plan nobody voted on, and one of forty
 * would never be reachable at a school with a six-person board — either way the
 * plan can never leave Pending, which is the failure this whole setting exists
 * to fix.
 */
export function clampThreshold(value: number | undefined): number {
  if (!Number.isFinite(value)) return EVENT_PLAN_SETTINGS_DEFAULTS.approvalThreshold;
  return Math.min(MAX_APPROVAL_THRESHOLD, Math.max(1, Math.round(value as number)));
}

/**
 * Rebuild from the known keys, so a caller can't stash arbitrary JSON in the
 * column — the same guard `updateModuleVisibility` applies.
 */
export function sanitizeEventPlanSettings(
  input: StoredEventPlanSettings
): EventPlanSettings {
  return {
    approvalThreshold: clampThreshold(input.approvalThreshold),
    autoCompletePastEvents:
      input.autoCompletePastEvents ??
      EVENT_PLAN_SETTINGS_DEFAULTS.autoCompletePastEvents,
  };
}

/** Cached per request — the plan page asks, and so does every vote. */
export const getEventPlanSettings = cache(async function getEventPlanSettings(
  schoolId: string | null | undefined
): Promise<EventPlanSettings> {
  if (!schoolId) return EVENT_PLAN_SETTINGS_DEFAULTS;

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { eventPlanSettings: true },
  });

  return resolveEventPlanSettings(school?.eventPlanSettings);
});
