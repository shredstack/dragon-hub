#!/usr/bin/env bash
#
# Checks the iOS project for the mistakes that are invisible until after an
# upload, and cheap to make. Run it before every archive:
#
#     ./scripts/preflight-ios.sh
#
# The README already warned about most of these. A warning is not a check —
# every one of them has a failure mode that looks like something else:
# a "development" APNs entitlement produces an app where push simply never
# arrives, with no error on the device or the server.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }

echo "iOS preflight"

# ── APNs environment ─────────────────────────────────────────────────────────
ENTITLEMENTS="ios/App/App/App.entitlements"
if grep -A1 '<key>aps-environment</key>' "$ENTITLEMENTS" | grep -q '<string>development</string>'; then
  bad "aps-environment is 'development' — TestFlight and App Store builds receive no pushes. Set it to 'production' in $ENTITLEMENTS."
else
  ok "aps-environment is production"
fi

# ── Privacy manifest ─────────────────────────────────────────────────────────
if [ -f "ios/App/App/PrivacyInfo.xcprivacy" ]; then
  ok "PrivacyInfo.xcprivacy present"
  # Being in the repo is not the same as being in the bundle. Xcode records
  # target membership in project.pbxproj, so that is what to grep.
  if grep -q "PrivacyInfo.xcprivacy" ios/App/App.xcodeproj/project.pbxproj; then
    ok "PrivacyInfo.xcprivacy is a member of the App target"
  else
    bad "PrivacyInfo.xcprivacy exists but is NOT in the App target — it will not be copied into the bundle, and the upload is rejected exactly as if it were missing. Add it in Xcode (File Inspector → Target Membership)."
  fi
else
  bad "ios/App/App/PrivacyInfo.xcprivacy is missing — App Store Connect rejects the upload at processing time."
fi

# ── Export compliance ────────────────────────────────────────────────────────
if grep -q 'ITSAppUsesNonExemptEncryption' ios/App/App/Info.plist; then
  ok "ITSAppUsesNonExemptEncryption declared"
else
  bad "ITSAppUsesNonExemptEncryption is missing from Info.plist — every upload will stop and ask."
fi

# ── Device family ────────────────────────────────────────────────────────────
if grep -q 'TARGETED_DEVICE_FAMILY = "1,2"' ios/App/App.xcodeproj/project.pbxproj; then
  bad "TARGETED_DEVICE_FAMILY includes iPad ('1,2'), which requires a full set of iPad screenshots. 1.0 ships iPhone-only: set it to \"1\"."
else
  ok "iPhone-only device family"
fi

# ── Custom URL scheme (native OAuth handoff) ─────────────────────────────────
if grep -q '<string>dragonhub</string>' ios/App/App/Info.plist; then
  ok "dragonhub:// URL scheme registered"
else
  bad "CFBundleURLSchemes does not include 'dragonhub' — the native sign-in handoff cannot return to the app."
fi

# ── Sign in with Apple ───────────────────────────────────────────────────────
if grep -q 'com.apple.developer.applesignin' "$ENTITLEMENTS"; then
  ok "Sign in with Apple entitlement present"
else
  bad "Sign in with Apple entitlement missing from $ENTITLEMENTS — required under Guideline 4.8 now that Google sign-in is offered."
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "Preflight FAILED — fix the above before archiving."
  exit 1
fi
echo "Preflight passed."
