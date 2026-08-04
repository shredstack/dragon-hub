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

0. Run the preflight script. It checks the four things that are invisible
   until after an upload, and it is the reason step 2 below is no longer a
   thing you have to remember:
   ```bash
   ./scripts/preflight-ios.sh
   ```
1. Bump the version. 1.0 (build 1) is what ships first; leave it alone for
   the first upload. After that:
   ```bash
   cd ios/App
   agvtool new-marketing-version 1.0.1     # MARKETING_VERSION  (1.0.1)
   agvtool next-version -all               # CURRENT_PROJECT_VERSION (build)
   ```
   A build number can never be reused for a given marketing version, so bump
   the build for *every* TestFlight upload even when the version is unchanged.
2. `aps-environment` in `ios/App/App/App.entitlements` is now `production` in
   the repo, which is what a shipped build needs. Flip it to `development`
   only while debugging push from Xcode against the APNs sandbox — and let
   the preflight script catch you if you forget to flip it back.
3. In Xcode: Product → Archive.
4. Distribute via App Store Connect.

**`PrivacyInfo.xcprivacy` target membership.** The file lives at
`ios/App/App/PrivacyInfo.xcprivacy` and is wired into the App target's
Resources phase in `project.pbxproj`. If `cap sync` or an Xcode migration ever
drops it, the upload is rejected at *processing* time with an error that
mentions neither the file nor the target — which is why the preflight script
greps `project.pbxproj` for it rather than just checking the file exists.

### Android (Play Internal Testing + Production)

1. Bump `versionCode` (an integer, +1 every upload — Play rejects a reused
   one) and `versionName` in `android/app/build.gradle`.
2. Build the AAB:
   ```bash
   cd android && ./gradlew bundleRelease
   ```
3. Sign with the release keystore. `android/app/build.gradle` reads
   `android/keystore.properties` and wires `signingConfigs.release` in
   automatically — but only if that file exists, so a fresh clone still
   builds. `keystore.properties` is gitignored and holds:
   ```properties
   storeFile=/absolute/path/to/dragonhub-release.keystore
   storePassword=…
   keyAlias=dragonhub
   keyPassword=…
   ```
   Back the keystore up somewhere that is not this laptop. Play will not
   accept an update signed by a different key, ever, and there is no recovery
   path that does not involve publishing a new listing.
4. Upload `android/app/build/outputs/bundle/release/app-release.aab` to
   Play Console.

### `google-services.json` — do this first, not last

**Firebase Cloud Messaging is completely inert until
`android/app/google-services.json` exists.** No error, no warning beyond one
`logger.info` line in the Gradle output: pushes are simply never delivered, and
nothing on the server can tell the difference between "the device has no token"
and "the project was never configured".

That means the entire notification system cannot be tested on Android until
this file lands. Get it early.

1. Firebase console → the DragonHub project → Project settings → Your apps →
   Add app → Android, package name `net.shredstack.dragonhub`.
2. Download `google-services.json` into `android/app/`. It is gitignored on
   purpose — it is per-project configuration, not per-developer, so hand it to
   teammates directly.
3. Project settings → Service accounts → Generate new private key, and set
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`
   (newlines as `\n`) on Vercel. Without these the *server* half is inert too.
4. `android/app/build.gradle` already applies the `google-services` plugin
   conditionally, so no code change is needed once the file is in place.

---

## Store submission checklist

- [ ] `./scripts/preflight-ios.sh` passes (covers `aps-environment`,
      `PrivacyInfo.xcprivacy` target membership, export compliance,
      iPhone-only device family, and the `dragonhub://` URL scheme)
- [ ] `android/app/google-services.json` in place — FCM is inert without it
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
