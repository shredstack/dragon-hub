import { NextResponse } from "next/server";

// Android Digital Asset Links file for App Links verification.
//
// Must be served at:
//   https://dragonhub.shredstack.net/.well-known/assetlinks.json
// with Content-Type: application/json.
//
// The /.well-known/assetlinks.json URL is rewritten to this route in
// next.config.ts.
//
// SHA-256 fingerprints needed:
//   - Debug:   keytool -list -v -keystore ~/.android/debug.keystore \
//                -alias androiddebugkey -storepass android -keypass android
//   - Release: keytool -list -v -keystore <release.keystore> -alias <key alias>
//   - Play App Signing: Play Console → App integrity → App signing key SHA-256

const PACKAGE_NAME = "net.shredstack.dragonhub";

// Comma-separated list in env, e.g. "AA:BB:...:ZZ,11:22:...:99"
const FINGERPRINTS = (
  process.env.ANDROID_CERT_FINGERPRINTS ||
  "__ANDROID_DEBUG_SHA256__,__ANDROID_RELEASE_SHA256__,__GOOGLE_PLAY_SIGNING_SHA256__"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const runtime = "edge";
export const dynamic = "force-static";

export function GET() {
  const body = [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: FINGERPRINTS,
      },
    },
  ];

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
