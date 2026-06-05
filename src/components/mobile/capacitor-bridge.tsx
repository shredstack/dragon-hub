"use client";

import { useEffect } from "react";

// Runs once when an authenticated user opens the app inside the
// Capacitor native shell (iOS or Android). No-op on the regular web.
//
// Responsibilities:
//   - Style the native status bar to match the app
//   - Request push notification permission and register the device token
//   - Hide the splash screen once the WebView is ready
//   - Handle Android hardware back button (web history aware)
//   - Listen for Universal Link / App Link opens (NextAuth magic links)

export function CapacitorBridge() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Dynamic import keeps Capacitor out of the SSR bundle and the
      // browser bundle for non-native users.
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      const [
        { StatusBar, Style },
        { SplashScreen },
        { App: CapApp },
        { PushNotifications },
      ] = await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
        import("@capacitor/app"),
        import("@capacitor/push-notifications"),
      ]);

      if (cancelled) return;

      // ── Status bar ────────────────────────────────────────────────────
      try {
        await StatusBar.setStyle({ style: Style.Default });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#ffffff" });
        }
      } catch {
        // Some Android versions throw on setBackgroundColor; safe to ignore.
      }

      // ── Splash screen ─────────────────────────────────────────────────
      // Hide once the WebView has handed control to the page.
      setTimeout(() => {
        SplashScreen.hide().catch(() => {});
      }, 200);

      // ── Android hardware back button ──────────────────────────────────
      CapApp.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack && window.history.length > 1) {
          window.history.back();
        } else {
          CapApp.exitApp();
        }
      });

      // ── Universal Link / App Link opens ───────────────────────────────
      CapApp.addListener("appUrlOpen", (event) => {
        try {
          const u = new URL(event.url);
          // Only handle our own domain; ignore third-party URLs.
          if (u.host !== "dragon-hub.shredstack.net") return;
          // Capacitor will load https URLs into the WebView automatically,
          // but if we're already loaded, force a navigation to the new path.
          const target = u.pathname + u.search + u.hash;
          if (window.location.pathname + window.location.search !== target) {
            window.location.assign(u.toString());
          }
        } catch {
          // Malformed URL — ignore.
        }
      });

      // ── Push notifications ────────────────────────────────────────────
      try {
        const perm = await PushNotifications.checkPermissions();
        let granted = perm.receive === "granted";
        if (!granted && perm.receive !== "denied") {
          const req = await PushNotifications.requestPermissions();
          granted = req.receive === "granted";
        }
        if (!granted) return;

        // The 'registration' event fires when APNs/FCM returns a token.
        PushNotifications.addListener("registration", async (t) => {
          try {
            await fetch("/api/push-tokens", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                token: t.value,
                platform: Capacitor.getPlatform(),
              }),
            });
          } catch (err) {
            console.warn("Failed to register push token", err);
          }
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.warn("Push registration error", err);
        });

        // Tapping a notification should route to its target URL if provided
        // (we'll include `url` in the notification payload data on the server).
        PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const url = action.notification.data?.url as string | undefined;
            if (url) window.location.assign(url);
          }
        );

        await PushNotifications.register();
      } catch (err) {
        console.warn("Push setup failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
