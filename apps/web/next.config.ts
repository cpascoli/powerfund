import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@powerfund/domain", "@powerfund/db"],
};

export default nextConfig;
