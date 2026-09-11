import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.KORTYX_NEXTJS_DIST_DIR ?? "dist",
  typescript: {
    tsconfigPath: process.env.KORTYX_NEXTJS_TSCONFIG ?? "tsconfig.json",
  },
  poweredByHeader: false,
  transpilePackages: ["@kortyx/stream"],
};

export default nextConfig;
