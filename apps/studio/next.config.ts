import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { NextConfig } from "next";

export function createStudioEditionConfig(
  studioDirectory = process.cwd(),
  editionModule = process.env.KORTYX_STUDIO_EDITION_MODULE,
): NextConfig {
  if (!editionModule) return {};
  if (!isAbsolute(editionModule))
    throw new Error(
      "KORTYX_STUDIO_EDITION_MODULE must be an absolute server-module path.",
    );
  const workspace = realpathSync(resolve(studioDirectory, "../.."));
  const module = realpathSync(editionModule);
  if (!statSync(module).isFile() || !module.startsWith(`${workspace}${sep}`)) {
    throw new Error("Studio edition must be a file inside the same workspace.");
  }
  return {
    outputFileTracingRoot: workspace,
    turbopack: {
      root: workspace,
      resolveAlias: {
        // Alias targets are relative to the Next app, not turbopack.root.
        "@/edition": `./${relative(realpathSync(studioDirectory), module).split(sep).join("/")}`,
      },
    },
    webpack(config) {
      config.resolve.alias = { ...config.resolve.alias, "@/edition$": module };
      return config;
    },
  };
}

export default createStudioEditionConfig();
