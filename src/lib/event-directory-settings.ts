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
  /**
   * Put the event leads' email addresses on the event, so a parent who wants to
   * help has somebody to write to.
   *
   * **On by default**, unlike `showReactorNames`, and the difference is who is
   * being named. A reaction is a parent's private interest, published back at
   * them; an event lead has taken a public-facing job on behalf of the PTA, and
   * "who do I ask about the Fun Run?" is the question this page exists to
   * answer. Off leaves the names and the titles — a parent still knows who is
   * running it, and still has the request button.
   *
   * Independent of `reactionsEnabled`: a school with the fun switched off still
   * wants families to be able to reach its board.
   */
  showLeadContact: boolean;
}

export const EVENT_DIRECTORY_DEFAULTS: EventDirectorySettings = {
  reactionsEnabled: true,
  customEmojiEnabled: true,
  showReactorNames: false,
  showLeadContact: true,
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
    showLeadContact:
      input.showLeadContact ?? EVENT_DIRECTORY_DEFAULTS.showLeadContact,
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
