import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@powerfund/domain",
    "@powerfund/db",
    "@powerfund/data-clients",
  ],
  serverExternalPackages: ["yahoo-finance2"],
  // Netlify sets these during the build only; functions never see them at
  // runtime. Inlining them lets the server know which deployment it is
  // without trusting a request header: the MCP server's OAuth origin and its
  // production-only write mode depend on it (src/lib/deploy.ts). Public
  // values — URLs and a context name — so inlining exposes nothing.
  env: {
    POWERFUND_DEPLOY_CONTEXT: process.env.CONTEXT ?? "",
    POWERFUND_SITE_URL: process.env.URL ?? "",
    POWERFUND_DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL ?? "",
  },
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
