import { cache } from "react";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * How loud a school wants Our Events (`/events`) to be.
 *
 * Stored in one jsonb column following the `moduleVisibility` /
 * `volunteerSettings` precedent, where **a missing column and a missing key
 * both mean the default** — so there is no backfill and no migration when a
 * fourth switch appears.
 *
 * Read it through `getEventDirectorySettings()` rather than poking at the JSON
 * at a call site: the defaults are the interesting part, and a call site that
 * reads `settings.reactionsEnabled` directly gets `undefined` for every school
 * that has never opened this screen — which is all of them, at release.
 *
 * Turning `reactionsEnabled` off **hides** reactions; it never deletes rows. A
 * school that flips it back gets its hearts back.
 */
export interface EventDirectorySettings {
  /** Reactions at all. */
  reactionsEnabled: boolean;
  /**
   * The "+" that opens the full emoji picker. Off leaves the curated
   * shortlist, for a school that wants a tidier page.
   */
  customEmojiEnabled: boolean;
  /**
   * Show *who* reacted, to everyone.
   *
   * Off by default, and deliberately: a parent's interest is a note to the
   * board, not a public statement, and a leaderboard of who cares about what is
   * a social dynamic no PTA needs. A small school that would enjoy seeing "Amy,
   * Sarah and 12 others love this" can turn it on.
   *
   * **Hands raised and help requests are never public**, under any setting.
   * Only reactions are affected by this.
   */
  showReactorNames: boolean;
}

export const EVENT_DIRECTORY_DEFAULTS: EventDirectorySettings = {
  reactionsEnabled: true,
  customEmojiEnabled: true,
  showReactorNames: false,
};

/** The stored shape — every key optional, because absence means the default. */
export type StoredEventDirectorySettings = Partial<EventDirectorySettings>;

export function resolveEventDirectorySettings(
  stored: StoredEventDirectorySettings | null | undefined
): EventDirectorySettings {
  return { ...EVENT_DIRECTORY_DEFAULTS, ...(stored ?? {}) };
}

/**
 * Rebuild from the known keys, so a caller can't stash arbitrary JSON in the
 * column — the same guard `updateModuleVisibility` applies.
 */
export function sanitizeEventDirectorySettings(
  input: StoredEventDirectorySettings
): EventDirectorySettings {
  return {
    reactionsEnabled:
      input.reactionsEnabled ?? EVENT_DIRECTORY_DEFAULTS.reactionsEnabled,
    customEmojiEnabled:
      input.customEmojiEnabled ?? EVENT_DIRECTORY_DEFAULTS.customEmojiEnabled,
    showReactorNames:
      input.showReactorNames ?? EVENT_DIRECTORY_DEFAULTS.showReactorNames,
  };
}

/** Cached per request, like `getSchoolAccess` — every card on the page asks. */
export const getEventDirectorySettings = cache(
  async function getEventDirectorySettings(
    schoolId: string | null | undefined
  ): Promise<EventDirectorySettings> {
    if (!schoolId) return EVENT_DIRECTORY_DEFAULTS;

    const school = await db.query.schools.findFirst({
      where: eq(schools.id, schoolId),
      columns: { eventDirectorySettings: true },
    });

    return resolveEventDirectorySettings(school?.eventDirectorySettings);
  }
);
