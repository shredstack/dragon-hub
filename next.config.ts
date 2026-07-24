import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every route in this app is dynamic and reads live PTA data, so a client
  // router cache entry is almost always the wrong answer. Next's default keeps
  // prefetched/seeded entries around for 300s, which means navigating back to a
  // page you'd already visited could replay a payload from up to five minutes
  // ago — long enough to miss a volunteer signup or a budget edit made
  // elsewhere. Zeroing both windows makes every navigation hit the server.
  // Nothing is lost by doing so: there are no loading.tsx boundaries, so the
  // "auto" prefetches were only fetching an empty shell anyway.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.blob.vercel-storage.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // Everything. The exceptions that would need a looser policy (the
        // Google embeds in LinkPreviewDialog) are *outbound* frames, which
        // `frame-ancestors` doesn't govern — it only decides who may frame us.
        source: "/:path*",
        headers: [
          // The app is full of one-click approve / remove / publish buttons, and
          // it is never legitimately embedded anywhere. Both headers, because
          // `X-Frame-Options` is what older browsers honour.
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Volunteer signup URLs carry a QR code in the path, and magic links
          // carry a token. Neither should travel in a Referer to a third party.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // iOS Universal Links verification (must be served at this exact path,
      // extensionless, with Content-Type: application/json).
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/well-known/apple-app-site-association",
      },
      // Android App Links verification.
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks",
      },
    ];
  },
};

export default nextConfig;
