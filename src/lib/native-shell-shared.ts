/**
 * Telling the native shell apart from a browser — the client-safe half.
 *
 * The iOS and Android builds are Capacitor shells pointing a WebView at
 * `dragonhub.shredstack.net`, so *the website is the app*: every page the web
 * renders is also a page inside a store build. Two things follow from that,
 * and both need this check:
 *
 *  - **Purchase surfaces.** Apple Guideline 3.1.1 and Play's payments policy
 *    forbid steering users to an outside checkout from inside the app. A
 *    pricing link added to the web appears inside the store build unless
 *    something suppresses it.
 *  - **OAuth.** Google returns `403: disallowed_useragent` for an OAuth flow
 *    running in an embedded WebView, so the native shell has to route sign-in
 *    through the system browser (see `src/lib/native-session.ts`).
 *
 * `appendUserAgent` in `capacitor.config.ts` is what puts the token there. It
 * lives here as one exported constant so the server helper (`native-shell.ts`)
 * and any client component read the same string and cannot drift — the same
 * arrangement `links-shared.ts` uses.
 *
 * This is a *hint*, not a security boundary. A user agent is client-controlled
 * and trivially spoofed. It decides what to render, never what to allow.
 */

/** The token `capacitor.config.ts` appends to the WebView's user agent. */
export const NATIVE_SHELL_UA_TOKEN = "DragonHubApp";

export function isNativeShellUserAgent(
  userAgent: string | null | undefined
): boolean {
  return !!userAgent && userAgent.includes(NATIVE_SHELL_UA_TOKEN);
}
