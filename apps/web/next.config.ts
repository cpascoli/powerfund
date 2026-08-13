import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@powerfund/domain",
    "@powerfund/db",
    "@powerfund/data-clients",
  ],
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
