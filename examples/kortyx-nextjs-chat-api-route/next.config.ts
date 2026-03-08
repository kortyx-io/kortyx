import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: "dist",
  poweredByHeader: false,
  transpilePackages: ["@kortyx/stream"],
};

export default nextConfig;
