import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { NodeFn, WorkflowDefinition } from "@kortyx/core";
import { resolveNode } from "./node-registry";

type LoadedNodeModule = Record<string, unknown>;

const dynamicImport = new Function(
  "specifier",
  // Avoid bundler static analysis of `import(...)` (e.g. Next.js/Turbopack).
  // This is only used on the server.
  "return import(specifier)",
) as (specifier: string) => Promise<LoadedNodeModule>;

function looksLikePath(specifier: string) {
  if (specifier.startsWith("file:")) return true;
  if (specifier.startsWith("./") || specifier.startsWith("../")) return true;
  if (specifier.startsWith("/")) return true;
  return specifier.includes("/");
}

function getWorkflowBaseDir(
  workflow: WorkflowDefinition | undefined,
  cwd: string,
): string {
  const meta = workflow?.metadata as Record<string, unknown> | undefined;
  const filePath = meta?.__filePath;
  if (typeof filePath === "string" && filePath.length > 0) {
    return dirname(filePath);
  }
  return cwd;
}

function pickNodeExport(mod: LoadedNodeModule, exportName?: string): NodeFn {
  if (exportName) {
    const candidate = mod[exportName];
    if (typeof candidate === "function") return candidate as NodeFn;
    throw new Error(`Node export "${exportName}" not found or not a function.`);
  }

  const defaultExport = mod.default;
  if (typeof defaultExport === "function") return defaultExport as NodeFn;

  const fnExports = Object.entries(mod).filter(
    ([, v]) => typeof v === "function",
  );
  if (fnExports.length === 1) return fnExports[0]![1] as NodeFn;

  const names = fnExports.map(([k]) => k).sort();
  throw new Error(
    `Node module must export a default function or exactly one named function (found: ${
      names.join(", ") || "none"
    }).`,
  );
}

export async function resolveNodeHandler(args: {
  run: string | NodeFn;
  workflow?: WorkflowDefinition;
  cwd?: string;
}): Promise<NodeFn> {
  const { run, workflow } = args;
  const cwd = args.cwd ?? process.cwd();

  if (typeof run === "function") return run;

  // New DX: YAML/JSON specify module path (optionally with #exportName)
  if (looksLikePath(run)) {
    const [moduleRef, exportName] = run.split("#", 2) as [
      string,
      string | undefined,
    ];
    const baseDir = getWorkflowBaseDir(workflow, cwd);

    const specifier = moduleRef.startsWith("file:")
      ? moduleRef
      : isAbsolute(moduleRef)
        ? pathToFileURL(moduleRef).href
        : pathToFileURL(resolve(baseDir, moduleRef)).href;

    const mod = await dynamicImport(specifier);
    return pickNodeExport(mod, exportName);
  }

  // Back-compat: symbolic node registry name
  return resolveNode(run);
}
