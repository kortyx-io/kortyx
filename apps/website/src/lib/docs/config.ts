import { readFileSync } from "node:fs";
import path from "node:path";
import { cache } from "react";

export type DocsProduct = {
  id: string;
  label: string;
  description: string;
  icon: "sdk" | "studio";
  versions: string[];
  latestVersion: string;
  overview: string;
  packageJsonPath?: string;
  npmPackage?: string;
  legacyRedirects: Record<string, Record<string, string>>;
};

export type DocsVersionDisplay = {
  label: string;
  subtitle: string;
};

const readProductPackageVersion = (product: DocsProduct): string | null => {
  if (!product.packageJsonPath) return null;
  try {
    const packageJsonPath = path.join(
      process.cwd(),
      "..",
      "..",
      product.packageJsonPath,
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: unknown;
    };

    return typeof packageJson.version === "string" &&
      packageJson.version.length > 0
      ? packageJson.version
      : null;
  } catch {
    return null;
  }
};

const readLatestProductNpmVersion = async (
  product: DocsProduct,
): Promise<string | null> => {
  if (!product.npmPackage) return null;
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(product.npmPackage)}/latest`,
      {
        headers: { accept: "application/json" },
        next: { revalidate: 3600 },
      },
    );
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
  async (productId = "sdk"): Promise<DocsVersionDisplay> => {
    const product = getDocsProduct(productId);
    if (!product) throw new Error(`Unknown docs product: ${productId}`);
    const version = getNewestStableVersion(
      readProductPackageVersion(product),
      await readLatestProductNpmVersion(product),
    );

    return {
      label: "Latest version",
      subtitle: version ? `v${version}` : product.latestVersion,
    };
  },
);

export const docsConfig: { docsRoot: string; products: DocsProduct[] } = {
  docsRoot: path.join(process.cwd(), "src", "docs"),
  products: [
    {
      id: "sdk",
      label: "Kortyx SDK",
      description:
        "Build typed agent workflows with providers, streaming, and runtime persistence.",
      icon: "sdk",
      versions: ["v0"],
      latestVersion: "v0",
      overview: "start-here",
      packageJsonPath: "packages/kortyx/package.json",
      npmPackage: "kortyx",
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
          "workflows/formats-ts-yaml-json":
            "core-concepts/formats-ts-yaml-json",
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
    },
    {
      id: "studio",
      label: "Kortyx Studio",
      description:
        "Observe runs, evaluate workflows, and operate your self-hosted Studio.",
      icon: "studio",
      versions: ["v0"],
      latestVersion: "v0",
      overview: "overview",
      packageJsonPath: "apps/studio/package.json",
      legacyRedirects: {},
    },
  ],
};

export function getDocsProduct(id: string): DocsProduct | undefined {
  return docsConfig.products.find((product) => product.id === id);
}

const productIds = new Set<string>();
for (const product of docsConfig.products) {
  if (
    productIds.has(product.id) ||
    !product.versions.includes(product.latestVersion)
  ) {
    throw new Error(`Invalid docs product config: ${product.id}`);
  }
  productIds.add(product.id);
}
