"use client";

/**
 * The app's side of the native OAuth handoff.
 *
 * The nonce generated here is the security property that matters most in the
 * whole flow. Custom URL schemes are **not exclusive** on either iOS or
 * Android: another installed app can register `dragonhub://` and receive the
 * callback carrying the ticket. It cannot receive the nonce, which never
 * leaves this device except in the two requests below — so the ticket it
 * captured redeems to nothing.
 *
 * The nonce is held in `@capacitor/preferences` rather than in memory because
 * the OS may evict the app while the system browser is in the foreground, and
 * an evicted nonce means a sign-in that fails after the user has already typed
 * their password.
 */

const NONCE_KEY = "dragonhub.auth.nonce";

async function prefs() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Open the provider's sign-in in the system browser.
 *
 * Returns false when it could not be started, so the caller can fall back to
 * an ordinary in-page redirect rather than leaving a button spinning.
 */
export async function startNativeOAuth(
  provider: "google" | "apple"
): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;

    const nonce = generateNonce();
    const p = await prefs();
    await p.set({ key: NONCE_KEY, value: nonce });

    const { Browser } = await import("@capacitor/browser");
    const url = new URL("/api/auth/native/start", window.location.origin);
    url.searchParams.set("provider", provider);
    url.searchParams.set("nonce", nonce);

    // `Browser.open` is SFSafariViewController on iOS and a Custom Tab on
    // Android — a real system browser, which is what Google requires. A
    // `window.open` would stay inside the WebView and get the
    // `disallowed_useragent` rejection this whole flow exists to avoid.
    await Browser.open({ url: url.toString(), presentationStyle: "popover" });
    return true;
  } catch (err) {
    console.warn("Could not start native OAuth", err);
    return false;
  }
}

/**
 * Read and clear the pending nonce.
 *
 * Cleared on read so a nonce cannot be replayed against a second ticket, and
 * so an abandoned sign-in doesn't leave one lying in `UserDefaults`.
 */
export async function consumeNativeAuthNonce(): Promise<string | null> {
  try {
    const p = await prefs();
    const { value } = await p.get({ key: NONCE_KEY });
    await p.remove({ key: NONCE_KEY });
    return value;
  } catch {
    return null;
  }
}
