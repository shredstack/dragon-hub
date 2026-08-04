# Shipping DragonHub to the App Store and Google Play

End-to-end runbook for getting `net.shredstack.dragonhub` into the Apple App
Store and Google Play, including the subscription/monetization posture given
that DragonHub is a free download but schools pay ShredStack for the AI
features.

**Status: all code blockers are closed.** What is left is accounts, credentials,
assets and submission — sections 2 onward. Section 1 is now a reference for what
was built and why, not a work list.

This document is the release owner's checklist. [mobile-shell/README.md](../mobile-shell/README.md)
stays the day-to-day dev reference — this one covers everything that only
matters when you're actually submitting.

---

## 0. Where things stand today

**Every code blocker in section 1 is closed.** They were implemented on
`sd-app-store-readiness-20260804` against
[claude_code_instructions/native_app/app-store-blockers-spec.md](../claude_code_instructions/native_app/app-store-blockers-spec.md).
What remains is process: accounts, credentials, assets, and submission.

| Piece | State |
|---|---|
| Capacitor 8.3.4, `ios/` + `android/` projects | ✅ committed |
| App ID / package name `net.shredstack.dragonhub` | ✅ consistent across `capacitor.config.ts`, `build.gradle`, `project.pbxproj` |
| Universal Links + App Links | ✅ entitlement, intent-filter, and both `.well-known` routes |
| Push (APNs + FCM) | ✅ `src/lib/push.ts` — **and now actually called**, see below |
| Notification system | ✅ inbox, bell, per-type preferences, quiet hours, 14 event types wired |
| Reviewer demo sign-in | ✅ `/sign-in?demo=1` + `scripts/seed-demo-school.ts` |
| Account deletion | ✅ in-app on `/profile` + signed-out at `/account/delete` |
| Sign in with Apple | ✅ provider, native browser handoff, Private Relay merge |
| Native shell detection | ✅ `src/lib/native-shell.ts` |
| Android release signing | ✅ `signingConfigs` wired, guarded on the keystore existing |
| `POST_NOTIFICATIONS` | ✅ in `AndroidManifest.xml` |
| `PrivacyInfo.xcprivacy` | ✅ in `ios/App/App/`, and a member of the App target |
| iOS usage strings, icons, splash | ✅ |
| Privacy policy + terms | ✅ `/privacy` names the in-app and web deletion paths |

**Still to do, all of it manual and none of it code:**

| # | Thing | Where |
|---|---|---|
| 1 | Apple Developer Program + Google Play Developer enrollment | §2 |
| 2 | Environment variables on Vercel | §3 |
| 3 | `android/app/google-services.json` from Firebase | §3 |
| 4 | Seed the demo school into **production** | §3 |
| 5 | Screenshots, listing copy, privacy questionnaires | §4 |
| 6 | Build, TestFlight / internal testing, submit | §5, §6 |

---

## 1. What shipped, and the decisions behind it

This section used to be the work list. It is now a reference: what exists, where
it lives, and — where the built solution differs from what this runbook
originally recommended — why.

### 1.1 Reviewer sign-in ✅

An env-gated Credentials provider in [src/lib/auth.ts](../src/lib/auth.ts),
registered only when `DEMO_LOGIN_EMAIL` **and** `DEMO_LOGIN_PASSWORD` are both
set. Reached at `/sign-in?demo=1`, which renders nothing at all on a normal
load — the branch is resolved on the server, so it isn't in the bundle a parent
receives.

Four hardenings beyond the draft this document originally sketched, each worth
knowing because the provider is public by construction (its password is written
in an App Store Connect field):

- Rate-limited per IP (`demoLoginPerIp`, 10 per 15 min) before any comparison.
- Constant-time password compare.
- The account is looked up by `DEMO_LOGIN_EMAIL` **only** — credentials never
  select which user to become.
- **It refuses to sign in an account holding `super_admin`.** A misconfigured
  demo account handing a reviewer platform-wide access to every school's family
  data is the one way this goes badly wrong, and it would be invisible.

`session.strategy` is `jwt`, which is what makes a Credentials provider work
here at all. Don't "fix" it to `database`.

### 1.2 Account deletion ✅

- **In-app**: a "Delete account" card at the bottom of `/profile`. Shows what
  will be destroyed in plain language, requires typing your own email address
  (not a checkbox), and blocks — naming the school — if you are the last
  `pta_board` member anywhere.
- **Signed-out web**: `/account/delete`, public, for Play's Data Safety
  requirement. Emails a single-purpose 1-hour token; the response is identical
  whether or not the address has an account.
- Both share one tail (`src/lib/account-deletion.ts`) that releases signup seats
  **before** deleting the row, per CLAUDE.md "The Signup Row Is the Seat".
  Verified end-to-end: deleting a room parent frees the seat, promotes the
  waitlisted parent, emails them, and leaves their message board posts standing
  and unattributed.
- `/privacy` §7 now names both paths.

### 1.3 Google in the WebView + Apple 4.8 ✅ — **we took the other option**

> ⚠️ This runbook originally recommended *hiding Google in the native shell*.
> That is **not** what was built. Both providers now work in the app.

Google returns `403: disallowed_useragent` for OAuth in an embedded WebView, so
the flow runs in the system browser — and SFSafariViewController does not share
a cookie jar with WKWebView, so finishing OAuth there sets the session cookie
somewhere the app cannot read. The bridge across is a one-time ticket:

```
[app]     Browser.open(/api/auth/native/start?provider=…&nonce=…)
[browser] …normal Auth.js OAuth… → session cookie in the BROWSER jar
[browser] /auth/native/return  → binds user to ticket → dragonhub://auth?ticket=…
[app]     POST /api/auth/native/redeem   ← runs INSIDE the WebView
          → Set-Cookie lands in the jar that matters
```

The nonce is generated **in the app** and required at redemption. Custom URL
schemes are not exclusive on either platform — another installed app can claim
`dragonhub://` and receive the callback — so the nonce is what makes a captured
ticket useless. Tickets are 32 random bytes, stored hashed, single-use,
5-minute TTL, consumed atomically.

**Sign in with Apple** is a real Auth.js provider, with four Apple-specific
traps handled in code (see §3 for the credentials it needs):

1. The client secret is a JWT that **expires within 6 months**. It is signed at
   runtime from the `.p8` (`src/lib/apple-client-secret.ts`) and cached hourly,
   so there is nothing to rotate and nothing to forget.
2. Apple replies with a cross-site `form_post`, on which `SameSite=Lax` cookies
   are not sent — so the state/PKCE/nonce cookies are explicitly overridden to
   `SameSite=None`. **This means Apple sign-in cannot be tested over plain-HTTP
   localhost.** Use a tunnel or a preview deployment.
3. Apple sends the user's name **exactly once**, in the first form-post body
   rather than the ID token. Captured in the `profile` callback.
4. `email_verified` arrives as the *string* `"true"`. The Apple branch of the
   `signIn` callback compares explicitly rather than for truthiness.

**Private Relay is the part that will generate real support email.** A parent
who picks "Hide My Email" gets `<random>@privaterelay.appleid.com`. DragonHub is
email-keyed — that address matches no signup row, no membership, no classroom —
so they would land on an empty account while their real one sits untouched. They
are routed to `/link-account` instead, which asks for "the email address your
school has for you", proves it with a mailed link, and merges the two.

### 1.4 Guideline 4.2 — "repackaged website" ✅

The reasoning here is unchanged and still worth reading; what changed is that
the app now has the evidence rather than the intention.

- **Push is front and centre, and asks properly.** The app no longer requests
  permission unexplained on first launch — the worst possible pattern, because
  iOS shows the system alert exactly once per install and a reflexive "Don't
  Allow" is permanent. A full-screen primer names what DragonHub sends, then
  the system prompt only ever appears after someone has already said yes.
- **The camera claim in the review notes is now true.** It previously was not:
  uploads went through a plain `<input type="file">`, which is not the camera
  API and does not exercise the usage strings. `@capacitor/camera` now backs the
  photo picker in the native shell, producing the real "Take Photo / Choose From
  Library" action sheet.
- **Native persistence** via `@capacitor/preferences` (`UserDefaults` /
  `SharedPreferences`), which is also why `NSPrivacyAccessedAPICategoryUserDefaults`
  reason `CA92.1` appears in the privacy manifest.
- **Haptics** on approve / submit / complete, and an **offline banner** via
  `@capacitor/network` — the most convincing detail in the set, because a
  browser bookmark answers a dropped connection with Safari's error page.
- **Android notification channels** matching the five preference groups, so a
  parent can mute committee chatter in Android's own settings and keep waitlist
  promotions.

If rejected anyway, the reply that works is a numbered list of native APIs with
the screen each appears on, plus a video. Don't argue the guideline; enumerate.

### 1.5 App-Bound Domains ✅ — set to `false`, deliberately

Of the two options this runbook offered, **the `WKAppBoundDomains` plist key was
the wrong one.** App-bound mode restricts cookie and storage APIs, and §1.3's
redeem step depends on a `Set-Cookie` taking effect from a `fetch` inside the
WebView. `limitsNavigationsToAppBoundDomains: false` it is;
`server.allowNavigation` already restricts navigation to the one host, which is
the property app-bound mode was being asked for.

Still test on a real device first. A blank white screen on launch is this.

### 1.6 Purchase suppression ✅

`appendUserAgent: "DragonHubApp"` on both platforms, and
[src/lib/native-shell.ts](../src/lib/native-shell.ts) +
`native-shell-shared.ts` (client-safe half) reading one shared constant so they
cannot drift.

There is no purchase UI in the app today, so this package is **preventive**. Its
real deliverable is the "Purchase Surfaces and the Native Shell" section now in
[CLAUDE.md](../CLAUDE.md), so whoever adds the first plan banner reaches for the
helper instead of learning the rule from a rejection email.

### 1.7 Android release signing ✅

`signingConfigs.release` reads `android/keystore.properties`. One thing the
original draft got wrong: **both the config block and the `signingConfig`
assignment are guarded on the file existing**, otherwise a fresh clone with no
keystore fails `assembleDebug` too, and a new contributor's first command is an
error about a key they were never given.

You still need to create the keystore:

```bash
keytool -genkey -v -keystore ~/keys/dragon-hub-release.keystore \
  -alias dragonhub -keyalg RSA -keysize 2048 -validity 10000
```

```properties
# android/keystore.properties — already gitignored
storeFile=/Users/sarahdorich/keys/dragon-hub-release.keystore
storePassword=...
keyAlias=dragonhub
keyPassword=...
```

> Back the keystore up somewhere you will still have in five years. With Play
> App Signing enabled (do enable it) a lost upload key is recoverable, but it's
> a support ticket and a week.

### 1.8 `POST_NOTIFICATIONS` ✅

In `AndroidManifest.xml`. The primer in §1.4 is what triggers the runtime prompt.

### 1.9 `google-services.json` ⛔ **still yours to do — do it early**

The only §1 item that is not code, and the one with the nastiest failure mode:
**FCM is completely inert without it**, with no error beyond one `logger.info`
line in the Gradle output. Nothing on the server can distinguish "the device has
no token" from "the project was never configured", which means the entire
notification system cannot be tested on Android until this lands. Steps in §3.

### 1.10 Smaller must-dos ✅

| Item | State |
|---|---|
| `aps-environment` | Now `production` in the repo. `npm run preflight:ios` fails the build if it is ever flipped back and forgotten. |
| `PrivacyInfo.xcprivacy` | Created, and wired into the App target's Resources phase in `project.pbxproj` — the preflight script greps for that too, because being in the repo is not the same as being in the bundle. |
| Export compliance | `ITSAppUsesNonExemptEncryption` = `false` in `Info.plist`. |
| iPad | `TARGETED_DEVICE_FAMILY = "1"` — **iPhone only for 1.0**, which drops the iPad screenshot requirement. |
| App name | Everything says `DragonHub` now, including the web manifest, the header, `/sign-in`, and the page title (which also no longer hard-codes one school's name in a multi-school app). |
| Versions | 1.0 / build 1 for the first upload. Bump commands in §8. |

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
Production**.

Two rules that will save you a confusing hour:

1. **Vercel bakes environment values into a deployment at build time.** Adding
   or rotating a variable does nothing to the *running* functions until the next
   production deploy. A feature that stays dark after the value is visibly
   correct in the dashboard is the expected symptom, not a second bug.
2. **Every group below is all-or-nothing.** A half-filled group behaves exactly
   like an empty one — the provider isn't registered and its button is hidden.
   That is deliberate (a visible button with no provider behind it is a 500 on
   click), but it means one missing variable silently disables the whole feature
   rather than erroring.

**Nothing here is required to deploy.** The notification inbox, bell,
preferences, quiet hours, announcements, and both account-deletion paths all
work with no new configuration at all. Each group below turns on one more thing.

---

### 3.1 Already set (confirm, don't change)

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` / `NEXTAUTH_URL`, `AUTH_RESEND_KEY`,
`ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.

Two of these now carry extra weight:

- **`CRON_SECRET`** also guards the new `/api/cron/notification-reminders`
  (daily, 16:00 UTC) — task reminders, shift reminders, and the retention sweep.
  It was already required; nothing to change.
- **`AUTH_URL` / `NEXTAUTH_URL`** is what builds the account-deletion and
  account-link email URLs. If it were unset those links would be malformed —
  but magic links already depend on it, so it must be correct.

### 3.2 Universal Links and App Links

| Variable | Where to get it |
|---|---|
| `APPLE_TEAM_ID` | [developer.apple.com/account](https://developer.apple.com/account) → Membership → Team ID (10 chars) |
| `ANDROID_CERT_FINGERPRINTS` | Comma-separated SHA-256s: debug, upload, **and Play App Signing** — see below |

```bash
# Debug (local dev App Links)
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA256

# Upload key
keytool -list -v -keystore ~/keys/dragon-hub-release.keystore \
  -alias dragonhub | grep SHA256

# Play App Signing key — Play Console → Test and release → App integrity
#   → App signing key certificate → SHA-256 (only exists AFTER your first upload)
```

> The Play App Signing fingerprint only exists **after** your first AAB upload,
> so this is a two-pass process: upload → grab the fingerprint → update the env
> var → redeploy → then verify App Links.

### 3.3 Push notifications

Without these, `src/lib/push.ts` is a no-op — inbox rows still accumulate, no
push is delivered. Nothing errors.

| Variable | Where to get it |
|---|---|
| `APNS_KEY_ID` | The 10 chars in the `.p8` filename (`AuthKey_XXXXXXXXXX.p8`) |
| `APNS_TEAM_ID` | Same value as `APPLE_TEAM_ID` |
| `APNS_BUNDLE_ID` | `net.shredstack.dragonhub` |
| `APNS_PRIVATE_KEY` | Contents of the `.p8`, newlines escaped to `\n` |
| `APNS_PRODUCTION` | `true` |
| `FIREBASE_PROJECT_ID` | Firebase service account JSON |
| `FIREBASE_CLIENT_EMAIL` | Same JSON |
| `FIREBASE_PRIVATE_KEY` | Same JSON, newlines escaped to `\n` |

**Getting the APNs key:** developer.apple.com → Certificates, Identifiers &
Profiles → **Keys** → **+** → tick **Apple Push Notifications service (APNs)** →
Continue → Register → **Download**. Apple lets you download a `.p8` exactly
once; there is no second chance. The filename contains the Key ID.

> ⚠️ **`APNS_PRODUCTION` must be `true`, and it must agree with the
> entitlement.** `aps-environment` is now `production` in the repo, so a server
> still set to sandbox will send every push into a void — silently, with no
> error on the device or the server. These two settings are a pair; changing one
> without the other is the most common way push "stops working".

**Firebase / `google-services.json` — do this early.** FCM is inert until the
file exists in the app itself, and the failure is invisible (see §1.9), so the
notification system cannot be tested on Android at all before it lands.

1. [console.firebase.google.com](https://console.firebase.google.com) → your
   project → Project settings → **Your apps** → Add app → **Android**, package
   name `net.shredstack.dragonhub`.
2. Download `google-services.json` into `android/app/`. It is gitignored on
   purpose — it is per-project configuration, not per-developer, so hand it to
   teammates directly.
3. Project settings → **Service accounts** → Generate new private key. That JSON
   holds the three `FIREBASE_*` values above.

### 3.4 Sign in with Apple

Required under **Guideline 4.8** now that the app offers Google sign-in. All
four or the provider isn't registered and the button is hidden.

| Variable | Where to get it |
|---|---|
| `AUTH_APPLE_ID` | The **Services ID** — see below. **Not** the bundle ID. |
| `APPLE_TEAM_ID` | Same as §3.2 |
| `APPLE_KEY_ID` | The 10 chars in the Sign in with Apple `.p8` filename |
| `APPLE_PRIVATE_KEY` | Contents of that `.p8`, newlines escaped to `\n` |

Setting this up in Apple's console has four steps and one of them is easy to
miss entirely:

1. **Enable the capability on the App ID.** Certificates, Identifiers & Profiles
   → Identifiers → `net.shredstack.dragonhub` → tick **Sign in with Apple** →
   Save. (The entitlement is already in `App.entitlements`.)
2. **Create a Services ID.** Identifiers → **+** → **Services IDs** →
   Description `DragonHub Web`, Identifier `net.shredstack.dragonhub.web`.
   **This string is `AUTH_APPLE_ID`.** Using the bundle ID instead fails at
   Apple's authorize endpoint with `invalid_client` and no other clue — it is
   the single most common Sign in with Apple misconfiguration.
3. **Configure it.** Edit the Services ID → tick Sign in with Apple → Configure:
   - Primary App ID: `net.shredstack.dragonhub`
   - Domains and Subdomains: `dragonhub.shredstack.net`
   - Return URLs: `https://dragonhub.shredstack.net/api/auth/callback/apple`

   Apple will make you **verify the domain**: it offers a
   `apple-developer-domain-association.txt` file that must be reachable at
   `https://dragonhub.shredstack.net/.well-known/apple-developer-domain-association.txt`.
   Add it to `public/.well-known/` and deploy before pressing Verify.
4. **Create the key.** Keys → **+** → tick **Sign in with Apple** → Configure →
   pick the primary App ID → Register → Download the `.p8` (once only).

> There is no `APPLE_CLIENT_SECRET`, deliberately. Apple's "client secret" is a
> JWT that expires within six months; pasting one into an env var means sign-in
> breaks half a year later with `invalid_client`, long after anyone remembers
> doing it. `src/lib/apple-client-secret.ts` signs one at runtime from the `.p8`
> and caches it hourly.

> Apple sign-in **cannot be tested over plain-HTTP localhost** — the cross-site
> form-post requires `SameSite=None`, which requires `Secure`. Use a tunnel or a
> Vercel preview deployment.

### 3.5 Reviewer demo sign-in

| Variable | Value |
|---|---|
| `DEMO_LOGIN_EMAIL` | e.g. `appreview@shredstack.net` |
| `DEMO_LOGIN_PASSWORD` | Long random string — `openssl rand -base64 24` |

The address must match a seeded account. **Set the variables first, then seed,
then redeploy.**

The password goes into an App Store Connect review-notes field, which is not
public but is not a secret store either — so it is a throwaway credential for a
fictional school, and rotating it per release cycle is cheap. The provider
refuses to sign in an account holding `super_admin`, so a mistake here can't
hand a reviewer platform admin.

### 3.6 Seed the demo school into production

App Review tests the **shipped app**, which points at the production origin — so
the demo school has to exist in the **production** database. There is no staging
path.

```bash
ENV_FILE=.env.prod.local \
DEMO_LOGIN_EMAIL=appreview@shredstack.net \
  npx tsx scripts/seed-demo-school.ts
```

The script prints the database host before it writes anything — check that line.
It is idempotent: it finds the school by join code and rebuilds its contents, so
re-running before each release refreshes the seeded timestamps (the inbox shows
relative times, which read as stale after a few months) without duplicating.

What the reviewer gets: an account that is `pta_board` of "Willow Creek
Elementary" — 6 classrooms, 2 committees including a live waitlist, 3 event
plans (draft / approved / completed with a wrap-up), a budget with 20
transactions, 2 fundraisers, 8 knowledge articles, important links, handoff
notes, volunteer hours awaiting approval, and 22 notifications with 7 unread so
the bell has a count on first paint.

Every name, address and email is invented. Two production-only details the
script handles, both invisible when wrong: the demo accounts are opted out of
the weekly committee digest (their `@…example` addresses cannot receive mail, so
leaving them in would hard-bounce nine addresses every Sunday and erode the
sending domain's reputation), and the PTA join code is mirrored into
`school_join_codes` so it actually redeems.

### 3.7 Setting them from the CLI

```bash
npm i -g vercel && vercel login && vercel link

# Simple values
printf 'ABCD123456' | vercel env add APPLE_TEAM_ID production
printf 'true'       | vercel env add APNS_PRODUCTION production
printf 'net.shredstack.dragonhub.web' | vercel env add AUTH_APPLE_ID production
openssl rand -base64 24 | tr -d '\n' | vercel env add DEMO_LOGIN_PASSWORD production

# Multi-line keys: escape newlines to \n first
awk 'BEGIN{ORS="\\n"} {print}' ~/keys/AuthKey_ABC1234567.p8 \
  | vercel env add APNS_PRIVATE_KEY production

awk 'BEGIN{ORS="\\n"} {print}' ~/keys/AuthKey_SIWA9876543.p8 \
  | vercel env add APPLE_PRIVATE_KEY production

jq -r '.private_key' ~/keys/firebase-adminsdk.json \
  | awk 'BEGIN{ORS="\\n"} {print}' \
  | vercel env add FIREBASE_PRIVATE_KEY production

vercel --prod   # REQUIRED — values are baked in at build time
```

### 3.8 Verify

```bash
# Well-known files — neither should contain __PLACEHOLDER__
curl -sI https://dragonhub.shredstack.net/.well-known/apple-app-site-association \
  | grep -i content-type          # must be application/json, no redirect
curl -s https://dragonhub.shredstack.net/.well-known/apple-app-site-association | jq .
curl -s https://dragonhub.shredstack.net/.well-known/assetlinks.json | jq .

# Apple's CDN copy — what devices actually read; can lag up to 24 hours
curl -s "https://app-site-association.cdn-apple.com/a/v1/dragonhub.shredstack.net" | jq .

# Google's verifier
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://dragonhub.shredstack.net&relation=delegate_permission/common.handle_all_urls" | jq .

# Demo sign-in renders (and does NOT render without the flag)
curl -s "https://dragonhub.shredstack.net/sign-in?demo=1" | grep -c "Demo account"   # expect 1
curl -s "https://dragonhub.shredstack.net/sign-in"        | grep -c "Demo account"   # expect 0

# Signed-out deletion page is reachable — Play checks this by opening it
curl -sI https://dragonhub.shredstack.net/account/delete | head -1                   # expect 200
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

**Apple**:

| Device | Size | Required |
|---|---|---|
| iPhone 6.9" (16 Pro Max / 15 Pro Max) | 1320×2868 | Yes |
| iPad 13" | 2064×2752 | **No** — `TARGETED_DEVICE_FAMILY = "1"`, iPhone only |

Dropping iPad for 1.0 (§1.10) is what removes the second set. If you ever add
iPad back, the screenshots become required again *and* the app has to genuinely
work there.

3–10 shots. Lead with the ones that answer Guideline 4.2 before a reviewer asks,
since screenshots are read before the app is opened:

- **A push notification on the lock screen** — the single most useful shot you
  can supply, because it is the 4.2 evidence in one image.
- The notification inbox with unread rows, or Profile → Notifications showing
  the per-type controls and quiet hours.
- The camera action sheet ("Take Photo / Choose From Library").
- Then the substance: dashboard with important links, a classroom message board,
  volunteer signup, the budget dashboard.

Capture these signed in as the demo account — that is what `db:seed:demo` is
for, and it is why the seed includes 22 notifications with 7 unread.

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

These rows must match `ios/App/App/PrivacyInfo.xcprivacy` **exactly** — Apple
diffs the two, and the manifest is now in the bundle, so a mismatch is a real
rejection rather than a theoretical one.

Play's **Data deletion** section wants two answers, and both now exist:

| Play field | Answer |
|---|---|
| Can users request account deletion? | Yes |
| Deletion URL | `https://dragonhub.shredstack.net/account/delete` |
| In-app path | Profile → Delete account |

A reviewer will open that URL in a private window with no session. It is a
public route and works signed-out by design — verify it after every deploy that
touches `middleware.ts`.

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
- Confirm **Sign in with Apple** is listed under Signing & Capabilities
  (the entitlement is in `App.entitlements`; Xcode needs the App ID to have the
  capability enabled — §3.4 step 1).

Then, before you archive:

```bash
npm run preflight:ios
```

It checks the five things that are invisible until after an upload:
`aps-environment` is `production`, `PrivacyInfo.xcprivacy` exists **and is a
member of the App target**, `ITSAppUsesNonExemptEncryption` is declared, the
device family is iPhone-only, and the `dragonhub://` URL scheme is registered.
Non-zero exit means don't archive.

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

**Launch and auth**
- [ ] App launches to the sign-in page, not a white screen (§1.5)
- [ ] Demo credentials sign in at `/sign-in?demo=1`
- [ ] `/sign-in` with no `?demo=1` shows no trace of the demo form in view-source
- [ ] **Google** sign-in opens the *system browser*, returns to the app, and
      lands signed in on `/dashboard`
- [ ] **Sign in with Apple** works, and the button matches Apple's HIG
- [ ] Sign in with Apple **with Hide My Email** reaches `/link-account`, and the
      mailed link merges it onto the existing account
- [ ] Magic link email opens the app directly (Universal Link), not Safari

**Notifications** — needs a second account to post from
- [ ] The permission primer appears after sign-in, and the *system* prompt only
      after tapping "Turn on notifications" — never before
- [ ] A committee post from account A reaches account B within seconds, with the
      right title, and tapping it lands on that committee
- [ ] Ten posts to the same board produce **one** notification, not ten
- [ ] The bell badge is correct on first paint; opening the inbox clears the
      delivered notifications
- [ ] Turning off "Committee messages" on `/profile` stops both the push and the
      inbox row; the master switch stops push but keeps the inbox
- [ ] An 11pm post produces an inbox row and no push; a waitlist promotion at
      11pm produces both
- [ ] Signing out stops that device receiving pushes

**Native integration** (this is the 4.2 evidence)
- [ ] Camera sheet appears with "Take Photo / Choose From Library" and shows the
      usage strings
- [ ] Offline banner appears in airplane mode
- [ ] Haptics fire on approve / submit / complete
- [ ] iOS swipe-back behaves sanely

**Deletion and commerce**
- [ ] Account deletion works end to end, and frees any volunteer seat held
- [ ] `/account/delete` works signed out, in a private window
- [ ] **No pricing, "Subscribe", or purchase link appears anywhere** (§7)

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
parents, teachers, and volunteer parents. The demo account has PTA board
access so every feature is reachable, and is seeded with a fictional school —
no real family's data is present.

IMPORTANT: please use the ?demo=1 sign-in URL above. The app's normal sign-in
is an emailed magic link, which you would not be able to receive.

Guideline 4.2 — native platform integration. DragonHub is not a browser
bookmark. Specifically:
  * APNs push notifications for classroom and committee messages, task
    assignments, volunteer waitlist promotions and shift reminders. Tap any
    notification to deep-link to the relevant screen. The permission prompt
    appears on first sign-in, after an explanatory screen; per-type controls
    and quiet hours are under Profile > Notifications.
  * Native camera and photo-library capture (UIImagePickerController via
    Capacitor) when setting a profile photo — the "Take Photo / Choose From
    Library" action sheet.
  * Universal Links, so emailed sign-in links open directly in the app.
  * Native preference storage (UserDefaults) for session and onboarding state.
  * Haptic feedback on approve/submit actions, and an offline banner driven by
    the native network reachability API.

Guideline 4.8 — Sign in with Apple is offered alongside Google, with equal
prominence, on the sign-in screen. Hide My Email is fully supported: because
the app's identity model is email-keyed, a relay address is routed to a
short flow that links it to the user's existing school record.

Guideline 5.1.1(v) — account deletion is available in-app at
Profile > Delete account, and without signing in at
https://dragonhub.shredstack.net/account/delete

Guideline 3.1.3(c) — DragonHub is free to download and contains no
purchasable content. Schools subscribe to the service directly from ShredStack
under a written agreement (Enterprise Services). There is no in-app purchase,
no pricing, and no call to action to purchase outside the app.
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
demo sign-in form. The app's normal sign-in is an emailed magic link, which you
would not be able to receive, so please use that URL. The account has PTA board
access; all features are reachable from the dashboard and the PTA Board Hub.

Account deletion: in-app at Profile > Delete account, and without signing in at
https://dragonhub.shredstack.net/account/delete
```

Enable **Play App Signing** when prompted (it's effectively mandatory for new
apps, and it's what makes a lost upload key recoverable).

### 6.2 Build the AAB

Signing (1.7) and the notification permission (1.8) are already in the repo. You
need two files that are not, both gitignored: `android/keystore.properties` and
`android/app/google-services.json` (§3.3).

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

5. Test the full §5.4 checklist, plus these Android-specific ones:
   - [ ] The permission prompt appears **after** the explanatory primer, not on
         first launch (Android 13+). If it never appears at all, either
         `POST_NOTIFICATIONS` is missing from the manifest or the primer was
         already dismissed on this install.
   - [ ] Android's own app notification settings list **all five channels** by
         name — Conversations, Tasks and assignments, Volunteering, Board and
         approvals, Announcements. A single unnamed channel means the push
         arrived without a `channelId`.
   - [ ] A push actually arrives. If nothing does and there is no error
         anywhere, `google-services.json` is missing from the build (§1.9) —
         that is exactly what its absence looks like.
   - [ ] Hardware back navigates web history, then exits.
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

Use [`isNativeShell()`](../src/lib/native-shell.ts) (§1.6) to gate anything
transactional. The rule is also written up in
[CLAUDE.md](../CLAUDE.md) under "Purchase Surfaces and the Native Shell", which
is where the next person adding a plan banner will actually look:

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

# 3. Check the things that are invisible until after upload
npm run preflight:ios

# 4. Refresh the reviewer's demo school (idempotent; keeps timestamps current)
ENV_FILE=.env.prod.local DEMO_LOGIN_EMAIL=appreview@shredstack.net \
  npx tsx scripts/seed-demo-school.ts

# 5. iOS
npm run mobile:open:ios     # Product > Archive > Distribute

# 6. Android
cd android && ./gradlew clean bundleRelease
```

Watch for:

- **Play target API deadlines.** Google raises the required `targetSdkVersion`
  annually (currently at 36 in `android/variables.gradle`, which is current).
  Existing apps get an update deadline around August each year; miss it and the
  listing stops being discoverable to new devices.
- **Apple SDK deadlines.** Apple requires builds be made with a recent Xcode/SDK,
  typically enforced each spring.
- **`aps-environment`.** If you flip it back to `development` for local push
  testing against the APNs sandbox, flip it back before archiving —
  `npm run preflight:ios` is the check that used to not exist. Remember it pairs
  with `APNS_PRODUCTION` on Vercel; the two must agree or push silently vanishes.
- **Notification types are data, not schema.** Adding one is an entry in
  `NOTIFICATION_TYPES` and nothing else — no migration, no backfill, and no app
  release, since the shells render the live site.
- **The Apple client secret takes care of itself.** It is signed at runtime from
  the `.p8`, so unlike most Sign in with Apple integrations there is nothing
  expiring in six months. The `.p8` itself does not expire.

---

## Master checklist

**Code — all done on `sd-app-store-readiness-20260804`**
- [x] Reviewer demo sign-in + seeded demo school (1.1)
- [x] In-app account deletion + signed-out web deletion URL (1.2)
- [x] Native OAuth handoff + Sign in with Apple + Private Relay merge (1.3)
- [x] Notification system, push primer, camera, haptics, offline banner (1.4)
- [x] `limitsNavigationsToAppBoundDomains: false` (1.5)
- [x] `appendUserAgent` + `isNativeShell()` + CLAUDE.md guidance (1.6)
- [x] Android `signingConfigs` block (1.7)
- [x] `POST_NOTIFICATIONS` in `AndroidManifest.xml` (1.8)
- [x] `aps-environment` = production, `PrivacyInfo.xcprivacy`,
      `ITSAppUsesNonExemptEncryption`, iPhone-only, `DragonHub` naming (1.10)

**Accounts (§2)**
- [ ] ShredStack D-U-N-S number
- [ ] Apple Developer Program (Organization) — $99/yr
- [ ] Google Play Developer (Organization) — $25

**Credentials and config (§3)** — the real remaining work
- [ ] Keystore created and **backed up**; `android/keystore.properties` written
- [ ] `android/app/google-services.json` downloaded into `android/app/` (§1.9 —
      do this first; nothing about Android push can be tested without it)
- [ ] APNs `.p8` created; `APNS_*` set with `APNS_PRODUCTION=true`
- [ ] `FIREBASE_*` set from the service-account JSON
- [ ] Sign in with Apple: capability on the App ID, Services ID created,
      **domain verified**, key downloaded, all four `APPLE_*` / `AUTH_APPLE_ID` set
- [ ] `DEMO_LOGIN_EMAIL` + `DEMO_LOGIN_PASSWORD` set
- [ ] `APPLE_TEAM_ID` and `ANDROID_CERT_FINGERPRINTS` set
- [ ] **`vercel --prod` redeployed** — values are baked in at build time
- [ ] Demo school seeded into **production** (`ENV_FILE=.env.prod.local`)
- [ ] AASA verifies via Apple's CDN; `assetlinks.json` includes the Play App
      Signing fingerprint (two-pass: needs a first upload)
- [ ] `/account/delete` returns 200 signed-out; `/sign-in?demo=1` renders the
      form and plain `/sign-in` does not

**Assets and declarations (§4)**
- [ ] `npm run mobile:assets` run and output committed
- [ ] iPhone 6.9" screenshots — **no iPad set needed**, the app is iPhone-only
- [ ] Play phone + 7" + 10" screenshots + 1024×500 feature graphic
- [ ] Screenshots show native UI (a lock-screen notification, the camera sheet)
- [ ] App Privacy (Apple) and Data Safety (Play) match `/privacy` **and**
      `PrivacyInfo.xcprivacy`
- [ ] Play Data deletion URL set to `/account/delete`
- [ ] Play target audience set to 18+

**Monetization (§7)**
- [ ] No pricing, subscribe button, or checkout link renders when
      `isNativeShell()` is true — verified on a real TestFlight/internal build
- [ ] ShredStack pricing page live
- [ ] Enterprise Services rationale in the App Review notes

**Submit (§5–§6)**
- [ ] `npm run preflight:ios` passes
- [ ] TestFlight build validated against the full §5.4 checklist
- [ ] Play internal testing build validated
- [ ] App Review Information filled in with demo credentials and the ?demo=1 URL
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
