import { NextResponse } from "next/server";

// Apple App Site Association file for Universal Links.
//
// Must be served at:
//   https://dragonhub.shredstack.net/.well-known/apple-app-site-association
// with Content-Type: application/json (no file extension, no redirects).
//
// The /.well-known/* URL is rewritten to this route in next.config.ts.
//
// TODO: Replace `__APPLE_TEAM_ID__` with the 10-character Team ID from
// Apple Developer (https://developer.apple.com/account → Membership). The
// final appID is "<TEAM_ID>.<bundle_id>" (e.g. "ABCD123456.net.shredstack.dragonhub").

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "__APPLE_TEAM_ID__";
const BUNDLE_ID = "net.shredstack.dragonhub";

export const runtime = "edge";
export const dynamic = "force-static";

export function GET() {
  const body = {
    applinks: {
      details: [
        {
          appIDs: [`${APPLE_TEAM_ID}.${BUNDLE_ID}`],
          components: [
            // Magic-link callback opens directly in the app
            { "/": "/api/auth/callback/*" },
            // Auth verify page (post-magic-link landing)
            { "/": "/verify-request*" },
            // Sign-in page
            { "/": "/sign-in*" },
            // Everything else also opens in app
            { "/": "/*" },
          ],
        },
      ],
    },
    // Reserved for future use (e.g. shared web credentials)
    webcredentials: {
      apps: [`${APPLE_TEAM_ID}.${BUNDLE_ID}`],
    },
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
