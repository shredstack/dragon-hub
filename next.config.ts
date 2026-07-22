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
