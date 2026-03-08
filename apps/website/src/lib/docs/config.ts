import path from "node:path";

export type DocsConfig = {
  versions: string[];
  latestVersion: string;
  docsRoot: string;
  legacyRedirects: Record<string, Record<string, string>>;
};

export const docsConfig: DocsConfig = {
  // Keep this list explicit so version ordering/cutovers are intentional.
  versions: ["v0"],
  latestVersion: "v0",
  docsRoot: path.join(process.cwd(), "src", "docs"),
  // Map old slug -> new slug (without /docs prefix and without version segment).
  legacyRedirects: {
    v0: {
      workflows: "core-concepts",
      runtime: "guides",
      agent: "core-concepts",
      providers: "guides",
      memory: "guides",
      streaming: "guides",
      packages: "reference",
      "workflows/define-workflows": "core-concepts/define-workflows",
      "workflows/formats-ts-yaml-json": "core-concepts/formats-ts-yaml-json",
      "workflows/node-resolution": "reference/node-resolution",
      "workflows/conditional-routing": "core-concepts/conditional-routing",
      "runtime/hooks": "core-concepts/hooks",
      "runtime/interrupts-and-resume": "guides/interrupts-and-resume",
      "runtime/persistence": "production/persistence",
      "runtime/framework-adapters": "production/framework-adapters",
      "agent/create-agent": "core-concepts/create-agent",
      "agent/process-chat": "guides/process-chat",
      "agent/stream-protocol": "reference/stream-protocol",
      "providers/setup-google-provider": "guides/setup-google-provider",
      "providers/provider-api": "reference/provider-api",
      "memory/adapters": "guides/memory-adapters",
      "streaming/sse": "guides/sse",
      "packages/package-overview": "reference/package-overview",
      "packages/api-surface": "reference/api-surface",
      "getting-started/documentation-structure-and-dx": "getting-started",
      "getting-started/quickstart-nextjs-api-route":
        "getting-started/quickstart-nextjs",
      "core-concepts/node-resolution": "reference/node-resolution",
      "start-here/start-here": "start-here",
      "troubleshooting/troubleshooting": "troubleshooting",
      "migration/migration-and-versions": "migration",
    },
  },
};

if (!docsConfig.versions.includes(docsConfig.latestVersion)) {
  throw new Error(
    `Invalid docs config: latestVersion "${docsConfig.latestVersion}" is not in versions.`,
  );
}
