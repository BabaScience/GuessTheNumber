import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The MongoDB driver reaches for Node internals and optional native modules.
  // Leaving it external keeps the bundler from trying to trace all of that.
  serverExternalPackages: ["mongodb"],
  async headers() {
    return [
      {
        // Room state is per-player and changes every turn — never let a CDN
        // or browser cache hold onto it.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
