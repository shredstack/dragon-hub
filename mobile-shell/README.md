# DragonHub Mobile

Native iOS + Android shells that wrap the production DragonHub web app
(`https://dragonhub.shredstack.net`) using Capacitor.

The web app is the source of truth — the mobile app is a thin native
container that adds: push notifications, magic-link deep linking, native
camera/photo access, and a splash screen.

---

## One-time setup

### Asset images

Drop these into [mobile-shell/assets/](./assets/) (see the README in that
folder for sizes), then:

```bash
npm run mobile:assets
```

### iOS

1. Open the project: `npm run mobile:open:ios`
2. In Xcode, select the **App** target → **Signing & Capabilities**:
   - Set **Team** to your Apple Developer team. Xcode will provision the
     bundle ID `net.shredstack.dragonhub`.
   - Add capability **Push Notifications**.
   - Add capability **Associated Domains** if not already shown — verify
     `applinks:dragonhub.shredstack.net` is listed.
3. Copy the 10-character **Team ID** (Xcode → target → Signing, or
   developer.apple.com → Membership) and set it on Vercel as
   `APPLE_TEAM_ID`. Redeploy so the
   `/.well-known/apple-app-site-association` file resolves.
4. Generate an **APNs Auth Key** at developer.apple.com → Certificates,
   Identifiers & Profiles → Keys → "+", with APNs enabled. Download the
   `.p8`. Set on Vercel:
   - `APNS_KEY_ID` (10 chars from the key)
   - `APNS_TEAM_ID` (same as above)
   - `APNS_BUNDLE_ID=net.shredstack.dragonhub`
   - `APNS_PRIVATE_KEY` (paste the .p8 file contents; replace newlines with `\n`)
   - `APNS_PRODUCTION=true` for store builds

### Android

1. In [Firebase Console](https://console.firebase.google.com), create a
   project (or reuse one) and add an Android app with package name
   `net.shredstack.dragonhub`.
2. Download `google-services.json` and copy it to
   `android/app/google-services.json`.
3. Generate a service account key (Project Settings → Service accounts →
   Generate new private key). Set on Vercel:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (replace newlines with `\n`)
4. Create a release keystore (one-time, store this safely):
   ```bash
   keytool -genkey -v -keystore dragon-hub-release.keystore \
     -alias dragonhub -keyalg RSA -keysize 2048 -validity 10000
   ```
5. Get the SHA-256 fingerprints for both debug and release keystores:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
     -alias androiddebugkey -storepass android -keypass android | grep SHA256
   keytool -list -v -keystore dragon-hub-release.keystore \
     -alias dragonhub | grep SHA256
   ```
   Set `ANDROID_CERT_FINGERPRINTS` on Vercel as a comma-separated list
   (also include the Play App Signing SHA-256 from Play Console → App
   integrity once available).

---

## Dev workflow

After any change to web code, plugins, or `capacitor.config.ts`:

```bash
npm run mobile:sync
```

Then open and run:

```bash
npm run mobile:open:ios       # then ⌘R in Xcode
npm run mobile:open:android   # then ▶ in Android Studio
```

The wrapped WebView loads `https://dragonhub.shredstack.net` directly,
so the iteration loop is _just deploy the web app_ — no app rebuild
needed for content changes.

---

## Sending push notifications

From any server-side code (route handler, server action, cron):

```ts
import { sendPushToUser } from "@/lib/push";

await sendPushToUser(userId, {
  title: "New classroom message",
  body: "Mrs. Patel posted in 3rd Grade — Room 12",
  url: "/classrooms/abc123",
});
```

`sendPushToUser` is a no-op (returns 0 sent) when push credentials are
not configured, so it's safe to call in dev.

---

## Building for release

### iOS (TestFlight + App Store)

1. Bump `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in the Xcode
   target (or via `agvtool`).
2. In `ios/App/App/App.entitlements`, change `aps-environment` from
   `development` to `production`. Xcode does NOT switch this for you;
   leaving it as `development` means pushes silently fail on TestFlight
   and App Store builds. Revert to `development` for local debug push
   testing.
3. In Xcode: Product → Archive.
4. Distribute via App Store Connect.

### Android (Play Internal Testing + Production)

1. Bump `versionCode` and `versionName` in
   `android/app/build.gradle`.
2. Build the AAB:
   ```bash
   cd android && ./gradlew bundleRelease
   ```
3. Sign with the release keystore (Gradle handles this if
   `android/keystore.properties` is configured).
4. Upload `android/app/build/outputs/bundle/release/app-release.aab` to
   Play Console.

---

## Store submission checklist

- [ ] `aps-environment` flipped to `production` in
      `ios/App/App/App.entitlements` for the archive build
- [ ] `APNS_PRODUCTION=true` set on Vercel for the production deployment
- [ ] `APPLE_TEAM_ID` set on Vercel and AASA file verifies via
      [Apple's AASA validator](https://app-site-association.cdn-apple.com/a/v1/dragonhub.shredstack.net)
- [ ] `ANDROID_CERT_FINGERPRINTS` set on Vercel and assetlinks.json
      verifies via
      [Digital Asset Links tester](https://developers.google.com/digital-asset-links/tools/generator)
- [ ] Icon and splash assets generated and committed
- [ ] Privacy policy live at `https://dragonhub.shredstack.net/privacy`
- [ ] Terms live at `https://dragonhub.shredstack.net/terms`
- [ ] Apple: app record created in App Store Connect with bundle ID
      `net.shredstack.dragonhub`
- [ ] Google: app record created in Play Console with package name
      `net.shredstack.dragonhub`
- [ ] Screenshots captured for required device sizes (iPhone 6.7"/6.1",
      and 7" + 10" tablets for Play)
- [ ] App Privacy questionnaire (Apple) and Data Safety form (Google)
      completed to match what's in `/privacy`
