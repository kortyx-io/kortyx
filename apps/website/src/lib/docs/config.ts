import path from "node:path";
import { cache } from "react";
import kortyxPackageJson from "../../../../../packages/kortyx/package.json";

export type DocsConfig = {
  versions: string[];
  latestVersion: string;
  docsRoot: string;
  legacyRedirects: Record<string, Record<string, string>>;
};

export type DocsVersionDisplay = {
  label: string;
  subtitle: string;
};

const readKortyxPackageVersion = (): string | null => {
  return typeof kortyxPackageJson.version === "string" &&
    kortyxPackageJson.version.length > 0
    ? kortyxPackageJson.version
    : null;
};

const readLatestKortyxNpmVersion = async (): Promise<string | null> => {
  try {
    const response = await fetch("https://registry.npmjs.org/kortyx/latest", {
      headers: { accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { version?: unknown };
    return typeof payload.version === "string" && payload.version.length > 0
      ? payload.version
      : null;
  } catch {
    return null;
  }
};

const parseStableVersionParts = (version: string): [number, number, number] => {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  return [
    Number.parseInt(major, 10) || 0,
    Number.parseInt(minor, 10) || 0,
    Number.parseInt(patch, 10) || 0,
  ];
};

const getNewestStableVersion = (
  firstVersion: string | null,
  secondVersion: string | null,
): string | null => {
  if (!firstVersion) return secondVersion;
  if (!secondVersion) return firstVersion;

  const firstParts = parseStableVersionParts(firstVersion);
  const secondParts = parseStableVersionParts(secondVersion);

  for (let index = 0; index < firstParts.length; index += 1) {
    const firstPart = firstParts[index] ?? 0;
    const secondPart = secondParts[index] ?? 0;

    if (secondPart > firstPart) return secondVersion;
    if (firstPart > secondPart) return firstVersion;
  }

  return secondVersion;
};

export const getLatestDocsVersionDisplay = cache(
  async (): Promise<DocsVersionDisplay> => {
    const version = getNewestStableVersion(
      readKortyxPackageVersion(),
      await readLatestKortyxNpmVersion(),
    );

    return {
      label: "Latest version",
      subtitle: version ? `v${version}` : docsConfig.latestVersion,
    };
  },
);

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
      memory: "production/persistence",
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
      "agent/process-chat": "core-concepts/stream-chat",
      "guides/process-chat": "core-concepts/stream-chat",
      "guides/stream-chat": "core-concepts/stream-chat",
      "agent/stream-protocol": "reference/stream-protocol",
      "providers/setup-google-provider":
        "kortyx-providers/google-generative-ai-provider",
      "guides/setup-google-provider":
        "kortyx-providers/google-generative-ai-provider",
      "providers/provider-api": "reference/provider-api",
      "memory/adapters": "production/persistence",
      "guides/memory-adapters": "production/persistence",
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
