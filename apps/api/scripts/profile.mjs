import { realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const apiDirectory = fileURLToPath(new URL("../", import.meta.url));
const contracts = {
  "@api/auth-contracts": "src/auth/contracts.ts",
  "@api/authorization-contracts": "src/authorization/contracts.ts",
  "@api/tenant-database-contracts": "src/database/contracts.ts",
};

/** Shared by tsup, tsc and tsx. Implementation aliases may change; contracts may not. */
export function apiTsconfig(selected = process.env.KORTYX_API_TSCONFIG) {
  const workspace = realpathSync(resolve(apiDirectory, "../.."));
  const path = realpathSync(resolve(apiDirectory, selected ?? "tsconfig.json"));
  if (!statSync(path).isFile() || !path.startsWith(`${workspace}${sep}`)) {
    throw new Error("API tsconfig must be a file inside the same workspace.");
  }
  const config = ts.getParsedCommandLineOfConfigFile(
    path,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );
  if (!config || config.errors.length) {
    throw new Error("Invalid API tsconfig.");
  }
  for (const [alias, target] of Object.entries(contracts)) {
    const resolved = ts.resolveModuleName(
      alias,
      resolve(apiDirectory, "src/app.ts"),
      config.options,
      ts.sys,
    ).resolvedModule;
    if (
      !resolved ||
      realpathSync(resolved.resolvedFileName) !==
        realpathSync(resolve(apiDirectory, target))
    ) {
      throw new Error(
        `API contract alias ${alias} must resolve to its public contract.`,
      );
    }
  }
  return path;
}
