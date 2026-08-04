import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.shredstack.dragonhub",
  appName: "DragonHub",
  webDir: "mobile-shell/dist",
  server: {
    url: "https://dragonhub.shredstack.net",
    androidScheme: "https",
    iosScheme: "https",
    allowNavigation: ["dragonhub.shredstack.net"],
  },
  ios: {
    contentInset: "always",
    /**
     * Deliberately false.
     *
     * App-bound mode only does anything when `WKAppBoundDomains` is also
     * declared in Info.plist; with the flag on and the key absent, WebKit
     * treats *nothing* as app-bound and the first navigation fails — a blank
     * white screen on launch, with no error anywhere.
     *
     * The fix is to turn the flag off rather than to add the plist key,
     * because app-bound mode also restricts cookie and storage APIs and
     * disables `evaluateJavaScript` on non-bound frames. The native auth
     * handoff (`/api/auth/native/redeem`) depends on a `Set-Cookie` taking
     * effect from a `fetch` inside the WebView, which is exactly what
     * app-bound mode is designed to constrain.
     *
     * `server.allowNavigation` above already restricts navigation to the one
     * host, which is the property app-bound mode was being asked for.
     */
    limitsNavigationsToAppBoundDomains: false,
    /**
     * Server-side native-shell detection keys off this token — see
     * `src/lib/native-shell.ts`. It is how the app knows to suppress purchase
     * surfaces (App Store Guideline 3.1.1) and to route OAuth through the
     * system browser.
     */
    appendUserAgent: "DragonHubApp",
  },
  android: {
    allowMixedContent: false,
    appendUserAgent: "DragonHubApp",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
