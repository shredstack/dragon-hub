"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PushPrimer } from "@/components/mobile/push-primer";
import { NetworkBanner } from "@/components/mobile/network-banner";
import { NOTIFICATION_GROUPS } from "@/lib/constants";
import { storePushToken } from "@/lib/native-preferences";

// Runs once when an authenticated user opens the app inside the Capacitor
// native shell (iOS or Android). No-op on the regular web.
//
// Responsibilities:
//   - Style the native status bar to match the app
//   - Create Android notification channels, then register for push *after* the
//     primer has been answered — never on first launch, unexplained
//   - Keep the device token fresh on every resume, not only on registration
//   - Hide the splash screen once the WebView is ready
//   - Handle Android hardware back button (web history aware)
//   - Listen for Universal Link / App Link opens and the dragonhub:// scheme

export function CapacitorBridge() {
  const router = useRouter();
  // Gates registration until the primer has been answered (or was already
  // answered on a previous launch).
  const [permissionSettled, setPermissionSettled] = useState(false);
  const registered = useRef(false);

  /**
   * POST the token. Called on the `registration` event *and* on every resume:
   * `lastSeenAt` is what tells the board a device is still real, and a
   * reinstalled app gets a new token that would otherwise never be sent.
   */
  const postToken = useCallback(async (token: string) => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const [{ Device }, { App: CapApp }] = await Promise.all([
        import("@capacitor/device"),
        import("@capacitor/app"),
      ]);

      const [info, appInfo] = await Promise.all([
        Device.getInfo().catch(() => null),
        CapApp.getInfo().catch(() => null),
      ]);

      await storePushToken(token).catch(() => {});

      await fetch("/api/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token,
          platform: Capacitor.getPlatform(),
          deviceId: (await Device.getId().catch(() => null))?.identifier,
          // "Sarah's iPhone" — so the device list on /profile names something
          // the owner recognizes instead of three identical "ios" rows.
          deviceName: info?.name ?? info?.model ?? null,
          appVersion: appInfo?.version ?? null,
        }),
      });
    } catch (err) {
      console.warn("Failed to register push token", err);
    }
  }, []);

  // ── Everything that does not depend on notification permission ───────────
  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      // Dynamic import keeps Capacitor out of the SSR bundle and the browser
      // bundle for non-native users.
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) {
        setPermissionSettled(true);
        return;
      }

      const [{ StatusBar, Style }, { SplashScreen }, { App: CapApp }] =
        await Promise.all([
          import("@capacitor/status-bar"),
          import("@capacitor/splash-screen"),
          import("@capacitor/app"),
        ]);

      if (cancelled) return;

      // ── Status bar ──────────────────────────────────────────────────────
      try {
        await StatusBar.setStyle({ style: Style.Default });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#ffffff" });
        }
      } catch {
        // Some Android versions throw on setBackgroundColor; safe to ignore.
      }

      // ── Splash screen ───────────────────────────────────────────────────
      setTimeout(() => {
        SplashScreen.hide().catch(() => {});
      }, 200);

      // ── Android hardware back button ────────────────────────────────────
      const backHandle = await CapApp.addListener(
        "backButton",
        ({ canGoBack }) => {
          if (canGoBack && window.history.length > 1) {
            window.history.back();
          } else {
            CapApp.exitApp();
          }
        }
      );
      cleanups.push(() => backHandle.remove());

      // ── Deep links ──────────────────────────────────────────────────────
      const urlHandle = await CapApp.addListener("appUrlOpen", (event) => {
        try {
          const u = new URL(event.url);

          // The native OAuth handoff. A custom scheme is the only thing that
          // reliably breaks out of SFSafariViewController / Custom Tabs and
          // back into the app, which is why sign-in returns this way rather
          // than through the https Universal Link below.
          if (u.protocol === "dragonhub:") {
            void handleNativeAuthReturn(u);
            return;
          }

          // Universal Link / App Link. Only our own domain; ignore the rest.
          if (u.host !== "dragonhub.shredstack.net") return;
          const target = u.pathname + u.search + u.hash;
          if (window.location.pathname + window.location.search !== target) {
            // A magic link has to be a full navigation — it sets a cookie
            // server-side — so this one deliberately stays `assign`.
            window.location.assign(u.toString());
          }
        } catch {
          // Malformed URL — ignore.
        }
      });
      cleanups.push(() => urlHandle.remove());

      // ── Haptics on meaningful confirmations ─────────────────────────────
      // Fired by `useHaptics()` (src/lib/haptics.ts) from approve / submit /
      // complete actions. Wired here so exactly one listener exists.
      const onHaptic = async (e: Event) => {
        try {
          const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
          const style = (e as CustomEvent<{ style?: string }>).detail?.style;
          if (style === "success") {
            const { NotificationType } = await import("@capacitor/haptics");
            await Haptics.notification({ type: NotificationType.Success });
          } else {
            await Haptics.impact({ style: ImpactStyle.Light });
          }
        } catch {
          // Simulators and some Android devices have no haptic engine.
        }
      };
      window.addEventListener("dragonhub:haptic", onHaptic);
      cleanups.push(() =>
        window.removeEventListener("dragonhub:haptic", onHaptic)
      );
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  // ── Push, only once the primer has been answered ─────────────────────────
  useEffect(() => {
    if (!permissionSettled || registered.current) return;
    registered.current = true;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const [{ PushNotifications }, { App: CapApp }] = await Promise.all([
        import("@capacitor/push-notifications"),
        import("@capacitor/app"),
      ]);
      if (cancelled) return;

      // ── Android channels ────────────────────────────────────────────────
      // Android 8+ drops a channel-less notification into an unnamed fallback
      // channel the user cannot mute by category. The ids ARE the
      // NOTIFICATION_GROUPS keys, and `push.ts` derives `channelId` from a
      // type's group — so what a parent mutes in Android's own settings is
      // exactly what the preferences page calls that group.
      if (Capacitor.getPlatform() === "android") {
        for (const [id, name] of Object.entries(NOTIFICATION_GROUPS)) {
          try {
            await PushNotifications.createChannel({
              id,
              name,
              description: `DragonHub — ${name}`,
              // Conversations get a heads-up banner; everything else is a
              // quiet arrival in the shade.
              importance: id === "conversations" ? 5 : 4,
              visibility: 1,
              vibration: true,
            });
          } catch (err) {
            console.warn(`Failed to create channel ${id}`, err);
          }
        }
      }

      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") return;

      const regHandle = await PushNotifications.addListener(
        "registration",
        (t) => void postToken(t.value)
      );
      cleanups.push(() => regHandle.remove());

      const errHandle = await PushNotifications.addListener(
        "registrationError",
        (err) => console.warn("Push registration error", err)
      );
      cleanups.push(() => errHandle.remove());

      // Tapping a notification. `router.push` rather than
      // `window.location.assign`: this used to be a full page load, which threw
      // away the WebView's state and showed a white flash on every tap.
      const tapHandle = await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const url = action.notification.data?.url as string | undefined;
          // Same rule the server applies when storing it — a notification must
          // never be able to navigate the WebView off-origin.
          if (url && url.startsWith("/") && !url.startsWith("//")) {
            router.push(url);
          }
        }
      );
      cleanups.push(() => tapHandle.remove());

      // Arriving while the app is open. iOS shows nothing by default in this
      // case, so the bell count would go stale until the next poll.
      const recvHandle = await PushNotifications.addListener(
        "pushNotificationReceived",
        () => {
          window.dispatchEvent(new CustomEvent("dragonhub:notification"));
          router.refresh();
        }
      );
      cleanups.push(() => recvHandle.remove());

      await PushNotifications.register();

      // Re-POST on every resume so `lastSeenAt` stays honest.
      const resumeHandle = await CapApp.addListener("resume", () => {
        PushNotifications.register().catch(() => {});
      });
      cleanups.push(() => resumeHandle.remove());

      // Opening the inbox means these have been seen, so clear the stack of
      // delivered notifications sitting in Notification Center / the shade.
      //
      // The app *icon* badge is a separate thing and `@capacitor/push-
      // notifications` has no setter for it. It is corrected by the next
      // push, whose payload carries the recomputed unread count from
      // `notify()`. Worth knowing rather than worth a dependency: the number
      // can lag until then, and the visible stack — which is what people
      // actually clear — goes immediately.
      const onSeen = () => {
        PushNotifications.removeAllDeliveredNotifications().catch(() => {});
      };
      window.addEventListener("dragonhub:notifications-seen", onSeen);
      cleanups.push(() =>
        window.removeEventListener("dragonhub:notifications-seen", onSeen)
      );
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [permissionSettled, postToken, router]);

  return (
    <>
      <PushPrimer onDecided={() => setPermissionSettled(true)} />
      <NetworkBanner />
    </>
  );
}

/**
 * `dragonhub://auth?ticket=…` — the last leg of the native OAuth handoff.
 *
 * The browser has finished OAuth and minted a one-time ticket. Redeeming it
 * has to happen from *inside* the WebView, because that is the only cookie jar
 * that matters here: the session cookie the browser set is unreachable.
 */
async function handleNativeAuthReturn(url: URL) {
  const ticket = url.searchParams.get("ticket");
  if (!ticket) return;

  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => {});
  } catch {
    // Browser may already be closed.
  }

  try {
    const { consumeNativeAuthNonce } = await import(
      "@/components/mobile/native-auth"
    );
    const nonce = await consumeNativeAuthNonce();
    const res = await fetch("/api/auth/native/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ticket, nonce }),
    });
    if (!res.ok) {
      window.location.replace("/sign-in?error=native");
      return;
    }
    const data = (await res.json()) as { redirectTo?: string };
    // `replace`, not `push`: the session cookie was just set by that response,
    // so a full navigation is what makes the server see it.
    window.location.replace(data.redirectTo || "/dashboard");
  } catch (err) {
    console.warn("Native auth redeem failed", err);
    window.location.replace("/sign-in?error=native");
  }
}
