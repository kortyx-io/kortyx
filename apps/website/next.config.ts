import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/docs.md",
        destination: "/api/docs-markdown",
      },
      {
        source: "/docs/:path*.md",
        destination: "/api/docs-markdown/:path*",
      },
    ];
  },
};

export default nextConfig;
