/**
 * The handful of things the native shell has to remember across launches.
 *
 * Client-only. Everything here goes through `@capacitor/preferences`, which is
 * `UserDefaults` on iOS and `SharedPreferences` on Android — real native
 * persistence, and the reason `NSPrivacyAccessedAPICategoryUserDefaults` with
 * reason `CA92.1` appears in `PrivacyInfo.xcprivacy`.
 *
 * Deliberately not `localStorage`: the WebView's storage is cleared by the OS
 * under storage pressure and by "Clear website data", which would make the app
 * re-ask for notification permission — the single worst thing to get wrong,
 * since iOS only ever shows the system prompt once per install.
 */

const KEYS = {
  /** Set once we have shown the primer, whatever the answer was. */
  primed: "dragonhub.push.primed",
  /** ISO timestamp of a "Not now", so the re-ask can be dated. */
  dismissedAt: "dragonhub.push.dismissedAt",
  /** The current device token, so /profile can mark "this device". */
  token: "dragonhub.push-token",
} as const;

/** Wait this long before offering the primer a second time. */
export const PUSH_REPROMPT_DAYS = 14;

async function prefs() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

export async function getPushPrimerState(): Promise<{
  primed: boolean;
  dismissedAt: Date | null;
}> {
  const p = await prefs();
  const [primed, dismissed] = await Promise.all([
    p.get({ key: KEYS.primed }),
    p.get({ key: KEYS.dismissedAt }),
  ]);
  const at = dismissed.value ? new Date(dismissed.value) : null;
  return {
    primed: primed.value === "1",
    dismissedAt: at && !Number.isNaN(at.getTime()) ? at : null,
  };
}

export async function markPushPrimed(): Promise<void> {
  const p = await prefs();
  await p.set({ key: KEYS.primed, value: "1" });
}

export async function markPushDismissed(): Promise<void> {
  const p = await prefs();
  await p.set({ key: KEYS.primed, value: "1" });
  await p.set({ key: KEYS.dismissedAt, value: new Date().toISOString() });
}

/**
 * Should the primer be shown right now?
 *
 * Never more than once until `PUSH_REPROMPT_DAYS` have passed since a "Not
 * now" — and then only once more. Someone who declined twice has answered.
 */
export function shouldShowPrimer(state: {
  primed: boolean;
  dismissedAt: Date | null;
}): boolean {
  if (!state.primed) return true;
  if (!state.dismissedAt) return false;
  const days = (Date.now() - state.dismissedAt.getTime()) / 86_400_000;
  return days >= PUSH_REPROMPT_DAYS && days < PUSH_REPROMPT_DAYS * 2;
}

export async function storePushToken(token: string): Promise<void> {
  const p = await prefs();
  await p.set({ key: KEYS.token, value: token });
}

export async function getStoredPushToken(): Promise<string | null> {
  const p = await prefs();
  return (await p.get({ key: KEYS.token })).value;
}

export async function clearPushToken(): Promise<void> {
  const p = await prefs();
  await p.remove({ key: KEYS.token });
}
