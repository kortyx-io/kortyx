import { realpathSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { NextConfig } from "next";

export function createStudioConfig(
  studioDirectory = process.cwd(),
  tsconfigPath = process.env.KORTYX_STUDIO_TSCONFIG,
): NextConfig {
  // Live authorization must not reuse provider responses across development HMR.
  const experimental = { serverComponentsHmrCache: false };
  if (!tsconfigPath) return { experimental };
  const workspace = realpathSync(resolve(studioDirectory, "../.."));
  const configFile = realpathSync(resolve(studioDirectory, tsconfigPath));
  if (
    !statSync(configFile).isFile() ||
    !configFile.startsWith(`${workspace}${sep}`)
  ) {
    throw new Error(
      "Studio tsconfig must be a file inside the same workspace.",
    );
  }
  return {
    experimental,
    // Next and tsc use the same native paths mappings. No second bundler alias.
    typescript: {
      tsconfigPath: relative(studioDirectory, configFile).split(sep).join("/"),
    },
    outputFileTracingRoot: workspace,
    turbopack: { root: workspace },
  };
}

export default createStudioConfig();
