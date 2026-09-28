import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@powerfund/domain",
    "@powerfund/db",
    "@powerfund/data-clients",
  ],
  serverExternalPackages: ["yahoo-finance2"],
  outputFileTracingIncludes: {
    "/api/**/*": ["../../docs/*.md"],
  },
  async headers() {
    return [
      {
        // The OAuth consent page grants an agent access to the book with one
        // click; it must never render inside someone else's frame.
        source: "/oauth/authorize",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
