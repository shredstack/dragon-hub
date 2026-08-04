"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * "You're offline" — native shell only.
 *
 * The most convincing three lines in the app for the question "is this just a
 * browser bookmark?", because a browser bookmark answers a dropped connection
 * with Safari's dinosaur page. It is also genuinely useful: the shell renders a
 * remote origin, so offline means a blank screen unless something says why.
 *
 * `@capacitor/network` rather than `navigator.onLine`: the browser API reports
 * "connected to a network", not "can reach the internet", and on iOS it is
 * wrong often enough to be worse than nothing.
 */
export function NetworkBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      if (cancelled) return;
      setOffline(!status.connected);

      const handle = await Network.addListener(
        "networkStatusChange",
        (s) => setOffline(!s.connected)
      );
      remove = () => handle.remove();
    })().catch(() => {});

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="h-4 w-4" />
      You&apos;re offline — changes won&apos;t save until you reconnect.
    </div>
  );
}
