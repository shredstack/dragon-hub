/**
 * A small physical confirmation on the actions that commit something.
 *
 * Client-safe and web-safe: on the web this dispatches an event nothing
 * listens to, which is the cheapest possible no-op. `CapacitorBridge` holds the
 * single listener that actually talks to `@capacitor/haptics`, so the plugin is
 * imported once rather than at every call site.
 *
 * Use it where a decision lands — approving hours, submitting a plan for
 * approval, completing a task, sending an announcement — and nowhere else.
 * Haptics on every tap is noise, and noise is what people turn off.
 */

export type HapticStyle = "light" | "success";

export function haptic(style: HapticStyle = "light"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("dragonhub:haptic", { detail: { style } })
  );
}
