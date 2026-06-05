import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
