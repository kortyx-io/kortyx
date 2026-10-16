import type { NextConfig } from "next";

// Known pre-/docs Markdown URLs from Search Console. Keep these exact so
// source imports, sample API paths, and unknown files still return 404.
const legacyRootDocs: [string, string][] = [
  [
    "/01-getting-started/01-installation.md",
    "/docs/sdk/getting-started/installation.md",
  ],
  [
    "/03-guides/03-react-node-backend.md",
    "/docs/sdk/guides/react-node-backend.md",
  ],
  [
    "/02-core-concepts/08-runtime-context.md",
    "/docs/sdk/core-concepts/runtime-context.md",
  ],
  [
    "/05-reference/01-package-overview.md",
    "/docs/sdk/reference/package-overview.md",
  ],
  [
    "/02-core-concepts/06-stream-chat.md",
    "/docs/sdk/core-concepts/stream-chat.md",
  ],
  [
    "/04-production/02-framework-adapters.md",
    "/docs/sdk/production/framework-adapters.md",
  ],
  [
    "/03-guides/02-interrupts-and-resume.md",
    "/docs/sdk/guides/interrupts-and-resume.md",
  ],
  [
    "/01-getting-started/03-quickstart-nextjs-server-action.md",
    "/docs/sdk/getting-started/quickstart-nextjs-server-action.md",
  ],
  [
    "/03-guides/04-render-streamed-chat.md",
    "/docs/sdk/guides/render-streamed-chat.md",
  ],
  [
    "/05-reference/03-stream-protocol.md",
    "/docs/sdk/reference/stream-protocol.md",
  ],
  ["/04-production/01-persistence.md", "/docs/sdk/production/persistence.md"],
  ["/02-core-concepts/03-nodes.md", "/docs/sdk/core-concepts/nodes.md"],
  ["/05-studio/01-overview.md", "/docs/studio/overview.md"],
  [
    "/02-core-concepts/01-define-workflows.md",
    "/docs/sdk/core-concepts/define-workflows.md",
  ],
  ["/05-reference/04-provider-api.md", "/docs/sdk/reference/provider-api.md"],
  ["/05-reference/02-api-surface.md", "/docs/sdk/reference/api-surface.md"],
  ["/05-studio/02-run-locally.md", "/docs/studio/run-locally.md"],
  [
    "/01-getting-started/02-quickstart-nextjs.md",
    "/docs/sdk/getting-started/quickstart-nextjs.md",
  ],
  ["/docs-Docs", "/docs"],
  [
    "/03-guides/01-project-structure.md",
    "/docs/sdk/guides/project-structure.md",
  ],
  [
    "/04-kortyx-providers/01-google-generative-ai-provider.md",
    "/docs/sdk/kortyx-providers/google-generative-ai-provider.md",
  ],
];

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      ...legacyRootDocs.map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      {
        source: "/:path*",
        has: [{ type: "host", value: "www\\.kortyx\\.io" }],
        destination: "https://kortyx.io/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
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
