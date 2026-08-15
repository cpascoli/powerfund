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
};

export default nextConfig;
