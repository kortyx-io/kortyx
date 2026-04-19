import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

type DocsLastUpdatedManifest = {
  generatedAt?: unknown;
  docs?: Record<string, unknown>;
};

export type DocLastUpdatedMeta = {
  generatedAt: string | null;
  updatedAt: string | null;
};

const getManifestPath = (): string =>
  path.join(process.cwd(), "generated", "docs-last-updated.json");

const readManifest = cache(
  async (): Promise<DocsLastUpdatedManifest | null> => {
    try {
      const raw = await readFile(getManifestPath(), "utf8");
      return JSON.parse(raw) as DocsLastUpdatedManifest;
    } catch {
      return null;
    }
  },
);

export const getDocLastUpdatedMeta = cache(
  async (relativeDocsPath: string): Promise<DocLastUpdatedMeta> => {
    const manifest = await readManifest();
    if (!manifest) {
      return {
        generatedAt: null,
        updatedAt: null,
      };
    }

    const generatedAt =
      typeof manifest.generatedAt === "string" &&
      manifest.generatedAt.length > 0
        ? manifest.generatedAt
        : null;

    const updatedAt =
      manifest.docs &&
      typeof manifest.docs === "object" &&
      typeof manifest.docs[relativeDocsPath] === "string" &&
      manifest.docs[relativeDocsPath].length > 0
        ? (manifest.docs[relativeDocsPath] as string)
        : null;

    return {
      generatedAt,
      updatedAt,
    };
  },
);
