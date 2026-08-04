import "server-only";
import { headers } from "next/headers";
import {
  isNativeShellUserAgent,
  NATIVE_SHELL_UA_TOKEN,
} from "@/lib/native-shell-shared";

export { NATIVE_SHELL_UA_TOKEN };

/**
 * True when the request came from the iOS/Android Capacitor shell rather than
 * a browser.
 *
 * See `native-shell-shared.ts` for why this exists and what it is allowed to
 * decide. In short: it gates *rendering* — purchase surfaces, and the choice
 * between an in-page OAuth redirect and the system-browser handoff. It never
 * gates authorization.
 *
 * Reading `headers()` opts the calling route into dynamic rendering. That is
 * unavoidable — the same URL genuinely has two answers — but it means this
 * should be called inside the component that branches on it rather than high
 * up in a layout, so one purchase banner doesn't make the whole tree dynamic.
 */
export async function isNativeShell(): Promise<boolean> {
  return isNativeShellUserAgent((await headers()).get("user-agent"));
}
