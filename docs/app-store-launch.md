# Shipping DragonHub to the App Store and Google Play

End-to-end runbook for getting `net.shredstack.dragonhub` from its current state
(Capacitor shells that build and run locally) into the Apple App Store and
Google Play, including the subscription/monetization posture given that
DragonHub is a free download but schools pay ShredStack for the AI features.

This document is the release owner's checklist. [mobile-shell/README.md](../mobile-shell/README.md)
stays the day-to-day dev reference — this one covers everything that only
matters when you're actually submitting.

---

## 0. Where things stand today

Already done, verified in the repo:

| Piece | State |
|---|---|
| Capacitor 8.3.4, `ios/` + `android/` projects | ✅ committed |
| App ID / package name `net.shredstack.dragonhub` | ✅ consistent across `capacitor.config.ts`, `build.gradle`, `project.pbxproj` |
| Universal Links + App Links | ✅ entitlement, intent-filter, and both `.well-known` routes wired via `next.config.ts` rewrites |
| Push (APNs + FCM) | ✅ `src/lib/push.ts`, `CapacitorBridge`, `UIBackgroundModes: remote-notification` |
| iOS usage strings (camera, photos) | ✅ in `Info.plist` |
| Icon / splash source assets | ✅ `mobile-shell/assets/` |
| Privacy policy + terms pages | ✅ `/privacy`, `/terms` |
| Web manifest + PWA icons | ✅ `public/manifest.webmanifest` |

**Not done, and every one of these will block or fail review.** Section 1 is the
real work; sections 2 onward are process.

---

## 1. Pre-flight blockers

Work these in order. Nothing below section 1 is worth starting until 1.1–1.4 are
closed, because they are the ones that get you rejected rather than delayed.

### 1.1 A reviewer cannot sign in — this is the #1 rejection risk

DragonHub authenticates with **email magic links** (Resend) and optionally
Google. An App Review or Play Review tester gets a login screen, types the demo
address you gave them, and then needs to open an inbox they do not control. They
will reject under **Guideline 2.1 — App Completeness** ("we were unable to sign
in") and you'll lose a review cycle each time.

You need a credential the reviewer can type. The cleanest fix that doesn't
weaken production auth is an **env-gated Credentials provider** that authorizes
exactly one seeded demo account and is a no-op when the env vars are absent:

```ts
// src/lib/auth.ts — add to the providers array
import Credentials from "next-auth/providers/credentials";

...(process.env.DEMO_LOGIN_EMAIL && process.env.DEMO_LOGIN_PASSWORD
  ? [
      Credentials({
        id: "demo",
        name: "Reviewer demo",
        credentials: { email: {}, password: {} },
        async authorize(creds) {
          // Single hard-coded identity. No lookup by arbitrary email, no
          // password column anywhere — this provider can only ever return
          // the one demo user, and only when both env vars are set.
          if (
            creds?.email !== process.env.DEMO_LOGIN_EMAIL ||
            creds?.password !== process.env.DEMO_LOGIN_PASSWORD
          ) {
            return null;
          }
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, process.env.DEMO_LOGIN_EMAIL))
            .limit(1);
          return user ?? null;
        },
      }),
    ]
  : []),
```

Then:

1. Seed a **demo school** with realistic-but-fake data (a few classrooms, a
   couple of events, a budget, some knowledge articles). An empty account reads
   as a broken app and invites a 2.1 rejection of its own.
2. Give the demo user `pta_board` so the reviewer can see the full feature set,
   including the admin hub — reviewers routinely probe every tab.
3. Set the env vars on Vercel production (section 3).
4. Do **not** render a demo login form in the UI. Reach it at
   `/api/auth/signin` or a `?demo=1` query param on `/sign-in`. Put the exact
   URL and credentials in the review notes.

Rate-limit the provider (there's already `src/lib/rate-limit.ts`) and rotate the
password after each release cycle.

> Alternative if you'd rather not add a provider at all: give reviewers a real
> mailbox they can open in Safari (e.g. a dedicated Gmail with a password) and
> put those credentials in the review notes too. It works, but it's two logins
> for a reviewer to fumble and it has failed people before. The Credentials
> provider is the recommendation.

### 1.2 In-app account deletion is mandatory

Apple **Guideline 5.1.1(v)**: any app that supports account creation must let
the user *initiate deletion of the account from inside the app*. Today
[src/app/privacy/page.tsx:185](../src/app/privacy/page.tsx#L185) says to contact
your PTA board admin or email support. That is a guaranteed rejection.

Build a "Delete my account" flow on `/profile`:

- Confirmation step that names the consequences in plain language.
- Server action reusing the existing deletion path in `src/actions/admin.ts`
  (which already calls `releaseSignupSeatsForUser()` — critical, per
  [CLAUDE.md](../CLAUDE.md) "The Signup Row Is the Seat": a departing account
  must free its volunteer and committee seats and promote whoever is next).
- If the user is the last `pta_board` member of a school, block with an
  explanation rather than orphaning the school.
- Update `/privacy` to describe the in-app path.

Google Play has the parallel requirement: the **Data deletion** section of the
Data Safety form wants both an in-app path and a **web URL** where deletion can
be requested without installing the app. Plan a `/account/delete` page that
works signed-out (collects the email, sends a confirmation link).

### 1.3 Google sign-in is broken inside the WebView, and triggers Apple 4.8

Two separate problems, one button.

**Problem A — it won't work.** Google blocks OAuth in embedded WebViews and
returns `403: disallowed_useragent`. The Capacitor shell is an embedded WebView.
A reviewer who taps "Sign in with Google" gets an error page.

**Problem B — Apple 4.8.** Offering a third-party social login (Google) means
Apple requires an equivalent privacy-preserving option, in practice **Sign in
with Apple**. Email magic links are *not* a third-party social login service, so
if Google is the only social provider, removing it removes the obligation.

Pick one:

- **Recommended: hide Google in the native shell.** Cheapest and closes both
  problems. `isGoogleAuthConfigured()` already gates the button in lockstep with
  the provider — add a second condition for the native shell (see 1.6 for how to
  detect it) so the sign-in page renders magic-link-only inside the app while
  the web keeps Google.
- **Or: keep Google and add Sign in with Apple.** Means opening OAuth in the
  system browser (`@capacitor/browser` + a custom URL scheme return), adding an
  Apple provider to Auth.js, an Apple Services ID and key, and handling Apple's
  private-relay addresses (`@privaterelay.appleid.com`) — which will collide
  with the email-identity assumptions in the `signIn` callback in
  [src/lib/auth.ts](../src/lib/auth.ts). Real work; only worth it if Google
  sign-in matters to parents.

### 1.4 Guideline 4.2 — "repackaged website"

`capacitor.config.ts` points `server.url` at `https://dragonhub.shredstack.net`,
so the app is a WebView over the live site. This is the single most common
rejection reason for Capacitor apps: *"your app provides an experience not
sufficiently different from a web browsing experience."*

DragonHub is in decent shape because it genuinely uses native capabilities —
push notifications, camera/photo library, Universal Links, splash screen,
hardware back button. Make that visible rather than assuming the reviewer finds
it:

- **Put push front and center.** Prompt for notification permission during
  onboarding with a screen explaining what it's for. A reviewer who never sees a
  permission prompt concludes there's no native integration.
- **Add one or two more native touches.** `@capacitor/preferences` is already a
  dependency — use it to keep the user signed in across launches and remember
  the last school. Haptics on approve/submit actions is a small, cheap
  additional signal.
- **State it in the review notes.** Explicitly: "DragonHub uses APNs push
  notifications for classroom messages and volunteer reminders, native camera
  capture for receipt and event photos, Universal Links for email sign-in, and
  persists session state natively. It is not a browser bookmark."
- **Screenshots should show native UI** — a notification on the lock screen, the
  camera sheet — not just web pages.

If you're rejected anyway, the reply that works is a numbered list of native
APIs with the screen each one appears on, plus a video. Don't argue the
guideline; enumerate the integrations.

### 1.5 App-Bound Domains will likely break the iOS WebView

`capacitor.config.ts` sets `ios.limitsNavigationsToAppBoundDomains: true`, but
`ios/App/App/Info.plist` has **no `WKAppBoundDomains` key**. When that flag is on
and no domains are declared, WebKit treats *nothing* as app-bound and navigation
fails. Either add the key:

```xml
<key>WKAppBoundDomains</key>
<array>
    <string>dragonhub.shredstack.net</string>
</array>
```

...or set `limitsNavigationsToAppBoundDomains: false`. Note that app-bound mode
also disables `WKWebView.evaluateJavaScript` on non-bound frames and restricts
cookie/storage APIs — if anything misbehaves after enabling it, that's why.

**Test this on a real device before anything else in section 5.** If the app
shows a blank white screen on launch, this is the cause.

### 1.6 Suppress purchase UI in the native shell (see also section 7)

The app renders the live website, so any "Subscribe" or pricing UI you add to
the web will appear inside the App Store build — which is exactly what Apple and
Google prohibit. You need a server-side signal that the request came from the
native shell.

Add a UA marker in `capacitor.config.ts`:

```ts
ios: {
  contentInset: "always",
  limitsNavigationsToAppBoundDomains: false, // see 1.5
  appendUserAgent: "DragonHubApp",
},
android: {
  allowMixedContent: false,
  appendUserAgent: "DragonHubApp",
},
```

And a server helper:

```ts
// src/lib/native-shell.ts
import { headers } from "next/headers";

/**
 * True when the request came from the iOS/Android Capacitor shell rather than
 * a browser. Used to suppress anything the app stores treat as a purchase
 * surface — pricing, "Subscribe", links to shredstack.net checkout — since the
 * native app renders the same server-rendered pages as the web.
 */
export async function isNativeShell(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes("DragonHubApp");
}
```

Run `npm run mobile:sync` after editing `capacitor.config.ts`.

### 1.7 Android release signing is not wired up

`android/app/build.gradle` has **no `signingConfigs` block**, so
`./gradlew bundleRelease` produces an unsigned AAB that Play Console rejects.
The README implies Gradle handles it "if `android/keystore.properties` is
configured" — nothing reads that file. Add it:

```groovy
// android/app/build.gradle — above the `android { }` block
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }
    }
}
```

Create the keystore and properties file (**never commit either**):

```bash
keytool -genkey -v -keystore ~/keys/dragon-hub-release.keystore \
  -alias dragonhub -keyalg RSA -keysize 2048 -validity 10000
```

```properties
# android/keystore.properties  — add to .gitignore
storeFile=/Users/sarahdorich/keys/dragon-hub-release.keystore
storePassword=...
keyAlias=dragonhub
keyPassword=...
```

```bash
printf '\nandroid/keystore.properties\nandroid/app/google-services.json\n' >> .gitignore
```

> Back the keystore up somewhere you will still have in five years. With Play
> App Signing enabled (do enable it) a lost upload key is recoverable, but it's
> a support ticket and a week.

### 1.8 Android notification permission is missing

`targetSdkVersion = 36`, so Android 13+ requires a runtime notification
permission — and neither `android/app/src/main/AndroidManifest.xml` nor the
`@capacitor/push-notifications` plugin manifest declares it (verified). Push
registration silently succeeds and no notification is ever shown. Add to the
manifest, alongside `INTERNET`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

`PushNotifications.requestPermissions()` in `CapacitorBridge` then prompts
correctly.

### 1.9 `google-services.json` is missing

`android/app/google-services.json` does not exist, so the google-services plugin
is skipped and FCM is inert. Create the Firebase project, add an Android app
with package `net.shredstack.dragonhub`, download the file, and place it at
`android/app/google-services.json`. Steps are in
[mobile-shell/README.md](../mobile-shell/README.md#android).

### 1.10 Smaller must-dos

| Item | Fix |
|---|---|
| `aps-environment` is `development` | Flip to `production` in `ios/App/App/App.entitlements` for every archive. Xcode does not do this for you; TestFlight push fails silently otherwise. |
| No `PrivacyInfo.xcprivacy` in the App target | Apple requires a privacy manifest. Add one to `ios/App/App/` declaring collected data types and required-reason API usage (`NSPrivacyAccessedAPICategoryUserDefaults`, reason `CA92.1`). |
| Export compliance prompt every submission | Add `<key>ITSAppUsesNonExemptEncryption</key><false/>` to `Info.plist`. (True for DragonHub — HTTPS only.) |
| `TARGETED_DEVICE_FAMILY = "1,2"` | iPad is supported, so **iPad screenshots are required** and the app must actually work on iPad. Either test it properly or set it to `"1"` for iPhone-only. |
| Manifest name is "Dragon Hub" | `public/manifest.webmanifest` says `Dragon Hub`; everything else says `DragonHub`. Make them match — store metadata mismatches draw reviewer questions. |
| `versionCode 1` / `MARKETING_VERSION 1.0` | Fine for the first upload; every subsequent Play upload needs a higher `versionCode` and every App Store build a higher `CURRENT_PROJECT_VERSION`. |

---

## 2. Accounts and enrollment

Do this first — Apple's verification can take days to weeks, and it's pure
waiting.

### Apple Developer Program — $99/year

Enroll at [developer.apple.com/programs](https://developer.apple.com/programs/).

Enroll as **ShredStack (Organization)**, not as an individual, if ShredStack is
the entity selling subscriptions — the seller name on the App Store listing
should match the entity on the school's invoice. Organization enrollment needs:

- A **D-U-N-S number** for ShredStack (free from Dun & Bradstreet, ~1–5 business
  days; request it at [developer.apple.com/enroll/duns-lookup](https://developer.apple.com/enroll/duns-lookup/))
- A legal entity in good standing, and a website at the company domain
- Authority to bind the company

Individual enrollment is instant-ish but publishes under your personal name and
is painful to migrate later. Given schools are signing contracts with ShredStack,
enroll as the organization.

### Google Play Developer — $25 one-time

Register at [play.google.com/console/signup](https://play.google.com/console/signup).

Register an **organization account** for the same reason. Google requires
identity verification (D-U-N-S also, for org accounts) and, for organization
accounts, verified contact details that will be **publicly displayed** on your
store listing. Expect a few days.

Google also requires new personal developer accounts to run a **12-tester /
14-day closed test** before production access. Organization accounts are exempt —
another reason to register as ShredStack.

### While you wait

- Firebase project + `google-services.json` (1.9)
- APNs auth key (`.p8`) — section 3
- Release keystore (1.7)
- Screenshots, description, privacy questionnaire answers (section 4)

---

## 3. Environment variables

All of these go on **Vercel → dragon-hub → Settings → Environment Variables →
Production**. Set them before you submit: the `.well-known` files are served by
the production deployment, and both stores verify them during review.

| Variable | Value | Why |
|---|---|---|
| `APPLE_TEAM_ID` | 10-char Team ID from [developer.apple.com/account](https://developer.apple.com/account) → Membership | Interpolated into `/.well-known/apple-app-site-association`. Universal Links dead without it. |
| `APNS_KEY_ID` | 10-char key ID from the `.p8` filename | APNs JWT auth |
| `APNS_TEAM_ID` | Same as `APPLE_TEAM_ID` | APNs JWT auth |
| `APNS_BUNDLE_ID` | `net.shredstack.dragonhub` | APNs topic |
| `APNS_PRIVATE_KEY` | Contents of `AuthKey_XXXXXXXXXX.p8`, newlines as `\n` | `src/lib/push.ts:47` un-escapes it |
| `APNS_PRODUCTION` | `true` | **Must be `true`** for TestFlight and App Store builds. `false`/unset routes to the APNs sandbox and production pushes silently vanish. |
| `FIREBASE_PROJECT_ID` | From the Firebase service account JSON | FCM admin |
| `FIREBASE_CLIENT_EMAIL` | From the same JSON | FCM admin |
| `FIREBASE_PRIVATE_KEY` | From the same JSON, newlines as `\n` | FCM admin |
| `ANDROID_CERT_FINGERPRINTS` | Comma-separated SHA-256 fingerprints: debug, upload, **and Play App Signing** | Served in `/.well-known/assetlinks.json`. Missing the Play signing one means App Links break for every store install. |
| `DEMO_LOGIN_EMAIL` | e.g. `appreview@shredstack.net` | Reviewer sign-in (1.1) |
| `DEMO_LOGIN_PASSWORD` | Long random string, rotated per release | Reviewer sign-in (1.1) |

Plus the existing production set — `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
`AUTH_RESEND_KEY`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`,
`CRON_SECRET` — which are presumably already set.

### Setting them from the CLI

```bash
npm i -g vercel && vercel login && vercel link

# Simple values
printf 'ABCD123456' | vercel env add APPLE_TEAM_ID production
printf 'true'       | vercel env add APNS_PRODUCTION production

# Multi-line keys: escape newlines to \n first
awk 'BEGIN{ORS="\\n"} {print}' ~/keys/AuthKey_ABC1234567.p8 \
  | vercel env add APNS_PRIVATE_KEY production

jq -r '.private_key' ~/keys/firebase-adminsdk.json \
  | awk 'BEGIN{ORS="\\n"} {print}' \
  | vercel env add FIREBASE_PRIVATE_KEY production

vercel --prod   # redeploy so the .well-known routes pick up the new values
```

### Getting the Android fingerprints

```bash
# Debug (local dev App Links)
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA256

# Upload key
keytool -list -v -keystore ~/keys/dragon-hub-release.keystore \
  -alias dragonhub | grep SHA256

# Play App Signing key — Play Console → Test and release → App integrity
#   → App signing key certificate → SHA-256 (only exists after first upload)
```

```bash
printf 'AA:BB:...,11:22:...,33:44:...' | vercel env add ANDROID_CERT_FINGERPRINTS production
vercel --prod
```

> The Play App Signing fingerprint only exists **after** your first AAB upload,
> so this is a two-pass process: upload → grab the fingerprint → update the env
> var → redeploy → then verify App Links.

### Verify both files resolve

```bash
curl -sI https://dragonhub.shredstack.net/.well-known/apple-app-site-association \
  | grep -i content-type          # must be application/json, no redirect
curl -s https://dragonhub.shredstack.net/.well-known/apple-app-site-association | jq .
curl -s https://dragonhub.shredstack.net/.well-known/assetlinks.json | jq .
```

Neither should contain a `__PLACEHOLDER__` string. Also check Apple's CDN copy,
which is what devices actually read and can lag by up to 24 hours:

```bash
curl -s "https://app-site-association.cdn-apple.com/a/v1/dragonhub.shredstack.net" | jq .
```

And Google's verifier:

```bash
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://dragonhub.shredstack.net&relation=delegate_permission/common.handle_all_urls" | jq .
```

---

## 4. Store listing assets

Same content for both stores, different crops.

### Text

- **App name**: `DragonHub` (30 chars max on Apple, 30 on Play). Check
  availability early — you reserve it when you create the App Store Connect
  record.
- **Subtitle** (Apple, 30 chars): e.g. `PTA coordination, simplified`
- **Short description** (Play, 80 chars)
- **Description** (4000 chars both): what the app does, who it's for. See
  section 7.4 for the subscription wording — it matters what you say here.
- **Keywords** (Apple, 100 chars, comma-separated, no spaces):
  `PTA,school,volunteer,classroom,parent,teacher,fundraiser,room parent,committee`
- **Category**: Education (primary). Secondary: Productivity.
- **Support URL**: `https://dragonhub.shredstack.net` (must be a live page that
  offers a way to get help)
- **Marketing URL**: your ShredStack product page
- **Privacy Policy URL**: `https://dragonhub.shredstack.net/privacy` — required
  by both, and it must be reachable without signing in (it is; `/privacy` is in
  the `publicRoutes` list in `middleware.ts`).

### Screenshots

Generate icons and splash first:

```bash
npm run mobile:assets   # capacitor-assets generate --assetPath mobile-shell/assets
npm run mobile:sync
```

Capture on simulators, signed in as the demo account so the data looks real:

**Apple** (App Store Connect accepts one size and scales down, but supply both):

| Device | Size | Required |
|---|---|---|
| iPhone 6.9" (16 Pro Max / 15 Pro Max) | 1320×2868 | Yes |
| iPad 13" (Pro M4) | 2064×2752 | Yes — because `TARGETED_DEVICE_FAMILY = "1,2"` |

3–10 per size. Screens worth showing: dashboard with important links, a
classroom message board, volunteer signup, the budget dashboard, a push
notification on the lock screen.

**Google Play**:

| Asset | Size |
|---|---|
| Phone screenshots (2–8) | 1080×1920 min |
| 7" tablet | 1024×600 min |
| 10" tablet | 1280×800 min |
| Feature graphic | 1024×500, **required** |
| App icon | 512×512 PNG, 32-bit |

```bash
xcrun simctl list devices          # find a booted device UDID
xcrun simctl io booted screenshot ~/Desktop/dragonhub-01.png
adb exec-out screencap -p > ~/Desktop/dragonhub-android-01.png
```

### Privacy declarations

Both stores ask what you collect. Answer from what DragonHub actually does, and
keep it consistent with `/privacy` — a mismatch is a rejection.

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | Authentication (magic links), notifications |
| Name | Yes | Yes | No | App functionality (rosters, attribution) |
| Phone number | If entered | Yes | No | App functionality |
| Photos | Yes | Yes | No | User content — message and event attachments |
| User content | Yes | Yes | No | Messages, tasks, notes, volunteer hours |
| Device ID (push token) | Yes | Yes | No | Push notifications |
| Diagnostics / analytics | No | — | — | — |

**Answer "No" to tracking on both.** DragonHub has no ad SDKs and no
cross-app identifiers — meaning no App Tracking Transparency prompt is needed.

For Play's **Target audience and content**, select **18 and over**. The app is
used by parents, teachers, and PTA board members; children are not the audience.
Saying otherwise pulls you into the Families Policy (extra requirements, ad
restrictions, additional review). Be prepared to note in the content
questionnaire that the app concerns children's school activities but is not
directed to children.

Play also requires a **Data deletion URL** — see 1.2.

---

## 5. iOS: build and submit

### 5.1 App Store Connect record

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps → **+** → New App
2. Platform iOS, Name `DragonHub`, Primary Language English (U.S.)
3. **Bundle ID**: `net.shredstack.dragonhub` — if it isn't in the dropdown,
   register it first at developer.apple.com → Certificates, Identifiers &
   Profiles → Identifiers, with **Push Notifications** and **Associated Domains**
   capabilities enabled.
4. SKU: `dragonhub-ios`

### 5.2 Xcode configuration

```bash
npm run mobile:sync
npm run mobile:open:ios
```

In Xcode, App target:

- **Signing & Capabilities**: Team = ShredStack, "Automatically manage signing"
  on. Confirm **Push Notifications** and **Associated Domains**
  (`applinks:dragonhub.shredstack.net`, `webcredentials:dragonhub.shredstack.net`)
  are both listed.
- **General**: Version `1.0.0`, Build `1`.
- Confirm `App.entitlements` has `aps-environment` = **`production`** (1.10).

Bump versions from the CLI on later releases:

```bash
cd ios/App
xcrun agvtool new-marketing-version 1.0.1   # MARKETING_VERSION
xcrun agvtool next-version -all             # CURRENT_PROJECT_VERSION
```

### 5.3 Archive and upload

```bash
npm run mobile:sync
npm run mobile:open:ios
```

Xcode → select **Any iOS Device (arm64)** → **Product → Archive** →
Distribute App → **App Store Connect** → Upload.

Or headless, once you have an App Store Connect API key:

```bash
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App \
  -configuration Release -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/
xcrun altool --upload-app -f build/App.ipa -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
```

Processing takes 15–60 minutes.

### 5.4 TestFlight

Test internally before submitting. Specifically verify:

- [ ] App launches to the sign-in page (not a white screen — see 1.5)
- [ ] Demo credentials sign in
- [ ] Magic link email opens the app directly (Universal Link), not Safari
- [ ] Push notification arrives with `APNS_PRODUCTION=true`
- [ ] Camera and photo picker both work and show the usage strings
- [ ] Android-style back gestures / iOS swipe-back behave sanely
- [ ] **No pricing, "Subscribe", or purchase link appears anywhere** (section 7)
- [ ] Account deletion works end to end (1.2)

### 5.5 Submit

Fill in the App Information, Pricing (**Free**), and App Privacy sections, then
under the build add **App Review Information**:

```
Sign-in required: Yes
Username: appreview@shredstack.net
Password: <DEMO_LOGIN_PASSWORD>
Sign-in URL: https://dragonhub.shredstack.net/sign-in?demo=1

Notes:
DragonHub is a coordination tool for elementary-school PTA boards, room
parents, teachers, and volunteer parents. The demo account is seeded with a
fictional school and has PTA board access so all features are reachable.

DragonHub is free to download and contains no purchasable content. Schools
subscribe to the service directly from ShredStack under a written agreement
(Guideline 3.1.3(c), Enterprise Services). There is no in-app purchase, no
pricing, and no call to action to purchase outside the app.

Native platform integration: APNs push notifications for classroom messages
and volunteer reminders (Settings > Notifications inside the app); native
camera and photo-library capture when attaching photos to a classroom message;
Universal Links so email sign-in links open directly in the app; native
session persistence and splash screen.
```

Choose **Manually release this version** for the first release so you control
the launch date. Typical review: 24–48 hours.

---

## 6. Android: build and submit

### 6.1 Play Console record

1. [play.google.com/console](https://play.google.com/console) → Create app
2. Name `DragonHub`, English (US), **App**, **Free**
3. Accept the declarations
4. Complete every item under **Dashboard → Set up your app**: privacy policy,
   app access, ads (**No**), content rating, target audience (18+), data safety,
   government apps (No), financial features (No)

**App access** is the Play equivalent of Apple's review notes and matters as
much:

```
All functionality is behind a login.
Username: appreview@shredstack.net
Password: <DEMO_LOGIN_PASSWORD>
Instructions: open https://dragonhub.shredstack.net/sign-in?demo=1 and use the
demo sign-in form. The account has PTA board access; all features are reachable
from the dashboard and the PTA Board Hub.
```

Enable **Play App Signing** when prompted (it's effectively mandatory for new
apps, and it's what makes a lost upload key recoverable).

### 6.2 Build the AAB

After 1.7 (signing) and 1.8 (notification permission):

```bash
npm run mobile:sync

# bump for every upload
# android/app/build.gradle: versionCode 2, versionName "1.0.1"

cd android
./gradlew clean bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Verify it's actually signed before uploading:

```bash
# jarsigner ships with the JDK
jarsigner -verify -verbose -certs \
  app/build/outputs/bundle/release/app-release.aab | head -20
```

A debug APK for local testing:

```bash
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 6.3 Internal testing, then production

1. Play Console → **Testing → Internal testing** → Create release → upload the AAB
2. Add testers by email, share the opt-in link, install from Play
3. Grab the **Play App Signing SHA-256** (App integrity), append it to
   `ANDROID_CERT_FINGERPRINTS`, and redeploy Vercel (section 3)
4. Verify App Links resolve:

```bash
adb shell pm get-app-links net.shredstack.dragonhub
# want: dragonhub.shredstack.net: verified

# force a re-verification if it says "legacy_failure"
adb shell pm verify-app-links --re-verify net.shredstack.dragonhub
```

5. Test the same checklist as 5.4, plus: notification permission prompt appears
   on first launch (Android 13+), and hardware back navigates web history rather
   than exiting.
6. **Production → Create release**, upload the same AAB, write release notes,
   roll out. Use a **staged rollout** (20% → 50% → 100%) for the first release.

Review for a new app is typically a few days and can stretch to a week —
noticeably slower than Apple for first submissions.

---

## 7. Subscriptions: how schools pay ShredStack without breaking store rules

This is the part that needs the most care. Get it wrong and you get rejected;
worse, get it wrong *after* approval and you risk removal.

### 7.1 The rules, and why DragonHub is fine

DragonHub is free to download; the *school* pays ShredStack for the service
(the AI features being the value driver). That's a B2B/enterprise sale, and both
stores accommodate it — but only if you keep every purchase surface out of the
app.

**Apple** — two guidelines apply, and DragonHub fits both:

- **3.1.3(c) Enterprise Services**: *"If your app is only sold directly by you to
  organizations or groups for their employees or students (for example
  professional databases and classroom management tools), you may use purchase
  methods in addition to in-app purchase to collect those payments."* DragonHub
  is literally a classroom-and-school-management tool sold to school PTAs. This
  is the guideline to cite.
- **3.1.3(f) Free Stand-alone Apps**: *"Free apps acting as a stand-alone
  companion to a paid web based tool ... do not need to use in-app purchase,
  **provided there is no purchasing inside the app, or calls to action for
  purchase outside of the app**."*

The bolded clause is the constraint. Note what it does *not* prohibit: telling a
user that a feature belongs to their school's plan. It prohibits selling and it
prohibits *pointing at* selling.

**Google Play** — the Payments policy governs *in-app* purchases of digital
content. Its published exemption list has no explicit B2B carve-out (I checked
the current policy page), but that's beside the point: an app with no purchase
flow at all doesn't engage the policy. This is the same posture as every
enterprise SaaS app on Play — Slack, Workday, Salesforce are free downloads
where the organization contracts separately. Since Google's June 2026 billing
changes, US/EEA/UK apps *may* also link out to external purchases (with a
service fee) — but that's a route into scope, not out of it. Don't take it.

**Net: DragonHub never sells anything inside either app.** ShredStack sells to
schools on the web, over email, on a call.

### 7.2 What this means in the code

Because the shells render `dragonhub.shredstack.net` directly, *the website is
the app*. Any pricing you add to the web appears inside the store builds. So:

Use `isNativeShell()` (1.6) to gate anything transactional:

```tsx
// Example: an unsubscribed-school banner rendered in a server component
const native = await isNativeShell();

<div className="rounded-lg border border-border bg-card p-4">
  <p className="font-medium">AI features aren&apos;t enabled for your school</p>
  <p className="mt-1 text-sm text-muted-foreground">
    Meeting-minutes summaries, guide generation, and Ask DragonHub are part of
    your school&apos;s DragonHub plan. Your PTA board can check your
    school&apos;s plan status.
  </p>
  {!native && (
    <SmartLink
      href="https://shredstack.net/dragonhub/pricing"
      openMode="new_tab"
      className="mt-3 inline-block text-sm font-medium text-primary"
    >
      View plans and pricing
    </SmartLink>
  )}
</div>
```

Rules for the native build:

| Allowed inside the app | Not allowed inside the app |
|---|---|
| "AI features are part of your school's DragonHub plan." | "Subscribe for $X/year" |
| "This feature isn't enabled for your school." | "Upgrade" / "Start free trial" buttons |
| "Your PTA board can check your school's plan status." | Any link to a pricing or checkout page |
| Hiding or disabling an unavailable feature entirely | "Visit shredstack.net to subscribe" |
| Showing plan status read-only to board members | Prices, tiers, comparison tables |

The most conservative and least fussy option, and what I'd default to: **hide
AI features entirely in the native shell when the school has no plan**, with the
brief non-promotional explanation above and no link. Board members who need to
act on it are working on a laptop anyway.

### 7.3 Where the "how to subscribe" messaging *does* go

Every one of these is outside the store-policy boundary:

1. **A ShredStack pricing page** (`shredstack.net/dragonhub`) — the real
   destination. Plans, what the AI features do, a "Talk to us" form.
2. **The DragonHub web app**, for board members on a browser — the banner above
   with the link shown, plus a plan-status panel in the PTA Board Hub
   (`ADMIN_HUB_SECTIONS`, Operations section, per
   [CLAUDE.md](../CLAUDE.md) — don't add it to the sidebar).
3. **Email.** Board onboarding emails, renewal reminders, the sales thread. Note
   that per CLAUDE.md, email surfaces already ignore `link_open_mode` entirely —
   they're plain links, and they're the right channel for a renewal CTA.
4. **The store listing description** — a factual capability note is fine (7.4).
5. **Onboarding for a new school**, which is a sales conversation before anyone
   installs anything.

Since ShredStack sells to schools rather than parents, none of this needs to be
in the app at all. The parent installing DragonHub is not the buyer.

### 7.4 Store listing wording

You may state that a subscription is required — you may not turn the listing
into a purchase funnel. Apple explicitly permits describing that the service
requires a paid account. Something like:

> DragonHub is provided to families by their school's PTA. Schools subscribe to
> DragonHub through ShredStack; parents and teachers at a subscribing school use
> the app at no cost. Some features, including AI-assisted meeting minutes and
> knowledge search, are available depending on the school's plan.
>
> Interested in DragonHub for your school? Visit shredstack.net.

That last line is fine in a store *listing* (both stores allow a marketing URL
and a company website reference). Keep it out of the app binary.

### 7.5 If you ever do want consumer in-app purchases

Not recommended, but for the record: the moment DragonHub sells to an individual
parent rather than a school, Apple's 3.1.3(c) exemption evaporates and you owe
StoreKit In-App Purchase with Apple's commission, plus Play Billing on Android.
That means a `@revenuecat/purchases-capacitor`-style integration, receipt
validation, subscription-state syncing to your database — a substantial project.
Keep the school-pays model.

---

## 8. Ongoing releases

For a web-content change, **no app release is needed** — the shells load the
live site, so `vercel --prod` ships it to every installed app. That's the payoff
of this architecture, and it's worth protecting: keep native changes rare.

You only need a store release when you change native code, a Capacitor plugin,
`capacitor.config.ts`, icons/splash, or permissions.

```bash
# 1. Sync native projects
npm run mobile:sync

# 2. Bump versions
cd ios/App && xcrun agvtool new-marketing-version 1.0.1 && xcrun agvtool next-version -all && cd ../..
#    android/app/build.gradle: versionCode +1, versionName "1.0.1"

# 3. iOS
npm run mobile:open:ios     # Product > Archive > Distribute

# 4. Android
cd android && ./gradlew clean bundleRelease
```

Watch for:

- **Play target API deadlines.** Google raises the required `targetSdkVersion`
  annually (currently at 36 in `android/variables.gradle`, which is current).
  Existing apps get an update deadline around August each year; miss it and the
  listing stops being discoverable to new devices.
- **Apple SDK deadlines.** Apple requires builds be made with a recent Xcode/SDK,
  typically enforced each spring.
- **`aps-environment`.** If you ever flip it back to `development` for local push
  testing, flip it back before archiving. There is no build-time check for this.

---

## Master checklist

**Code (section 1)**
- [ ] Reviewer demo sign-in path + seeded demo school (1.1)
- [ ] In-app account deletion on `/profile` + signed-out web deletion URL (1.2)
- [ ] Google sign-in hidden in the native shell (1.3)
- [ ] Native-integration polish + review-note enumeration for 4.2 (1.4)
- [ ] `WKAppBoundDomains` added or `limitsNavigationsToAppBoundDomains` off (1.5)
- [ ] `appendUserAgent` + `isNativeShell()` helper (1.6)
- [ ] Android `signingConfigs` block + `keystore.properties` (gitignored) (1.7)
- [ ] `POST_NOTIFICATIONS` in `AndroidManifest.xml` (1.8)
- [ ] `android/app/google-services.json` in place (gitignored) (1.9)
- [ ] `aps-environment` = `production`; `PrivacyInfo.xcprivacy`;
      `ITSAppUsesNonExemptEncryption`; iPad decision; manifest name (1.10)

**Accounts (section 2)**
- [ ] ShredStack D-U-N-S number
- [ ] Apple Developer Program (Organization) — $99/yr
- [ ] Google Play Developer (Organization) — $25

**Config (section 3)**
- [ ] All env vars set on Vercel production and redeployed
- [ ] AASA verifies via Apple's CDN
- [ ] `assetlinks.json` includes the Play App Signing fingerprint

**Assets (section 4)**
- [ ] `npm run mobile:assets` run and output committed
- [ ] iPhone 6.9" + iPad 13" screenshots
- [ ] Play phone + 7" + 10" screenshots + 1024×500 feature graphic
- [ ] App Privacy (Apple) and Data Safety (Play) match `/privacy`
- [ ] Play target audience set to 18+

**Monetization (section 7)**
- [ ] No pricing, subscribe button, or checkout link renders when
      `isNativeShell()` is true — verified on a real TestFlight/internal build
- [ ] ShredStack pricing page live
- [ ] Plan-status panel added to the PTA Board Hub (web)
- [ ] Enterprise Services rationale written into the App Review notes

**Submit (sections 5–6)**
- [ ] TestFlight build validated against the 5.4 checklist
- [ ] Play internal testing build validated
- [ ] App Review Information / App access filled in with demo credentials
- [ ] iOS submitted (manual release)
- [ ] Android submitted (staged rollout)

---

## Sources

- [App Review Guidelines — Apple Developer](https://developer.apple.com/app-store/review/guidelines/)
- [Understanding Google Play's Payments policy — Play Console Help](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
- [An update regarding Google Play's policies for developers serving users in the US — Play Console Help](https://support.google.com/googleplay/android-developer/answer/15582165?hl=en)
- [Expanded billing choice and lower fees on Google Play — Android Developers Blog](https://android-developers.googleblog.com/2026/06/play-expanded-billing.html)
- [App Store Review Guidelines: Will Your Webview App Be Rejected? — MobiLoud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
- [App Store Review Guideline updates — Apple Developer News](https://developer.apple.com/news/?id=xqk627qu)
