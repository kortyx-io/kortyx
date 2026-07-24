import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import Module from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import {
  type Agent,
  type AgentProjectTopologyOptions,
  projectWorkflowTopology,
} from "@kortyx/agent";
import type { WorkflowDefinition } from "@kortyx/core";
import {
  type EnsureWorkflowTopologyRequest,
  EnsureWorkflowTopologyRequestSchema,
  type EnsureWorkflowTopologyResponse,
  EnsureWorkflowTopologyResponseSchema,
} from "@kortyx/telemetry-contracts";
import { require as tsxRequire } from "tsx/cjs/api";

type CliOptions = {
  entry?: string | undefined;
  exportName?: string | undefined;
  apiUrl?: string | undefined;
  apiKey?: string | undefined;
  environment?: string | undefined;
  serviceName?: string | undefined;
  deploymentRef?: string | undefined;
  dryRun: boolean;
  json: boolean;
  cwd: string;
};

type PushResult = {
  snapshot: EnsureWorkflowTopologyRequest;
  response?: EnsureWorkflowTopologyResponse;
};

type ModuleResolveFilename = (
  request: string,
  parent: NodeJS.Module | undefined,
  isMain: boolean,
  options?: unknown,
) => string;

const commandHelp = `Usage:
  kortyx topology push --entry <path> [options]

Options:
  --entry <path>             Module exporting an agent or workflows array.
  --export <name>            Named export to load from the entry module.
  --api-url <url>            Kortyx API URL. Defaults to KORTYX_TELEMETRY_API_URL or KORTYX_API_URL.
  --api-key <key>            Telemetry API key. Defaults to KORTYX_TELEMETRY_API_KEY.
  --environment <name>       Telemetry environment. Defaults to KORTYX_TELEMETRY_ENVIRONMENT or NODE_ENV or development.
  --service-name <name>      Service name. Defaults to KORTYX_TELEMETRY_SERVICE_NAME or package.json name.
  --deployment-ref <ref>     Deployment ref. Defaults to KORTYX_TELEMETRY_DEPLOYMENT_REF, GITHUB_SHA, or VERCEL_GIT_COMMIT_SHA.
  --dry-run                  Project topology and print it without pushing.
  --json                     Print machine-readable JSON.
  -h, --help                 Show help.

The CLI loads .env and .env.local from the current working directory without overriding existing environment variables.

Examples:
  kortyx topology push --entry src/lib/agent.ts
  kortyx topology push --entry src/workflows.ts --export workflows --environment production
`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isWorkflowDefinition = (value: unknown): value is WorkflowDefinition =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isRecord(value.nodes) &&
  Array.isArray(value.edges);

const isAgent = (value: unknown): value is Agent =>
  isRecord(value) && typeof value.projectTopology === "function";

const parseArgs = (argv: string[], cwd = process.cwd()): CliOptions => {
  const [command, subcommand, ...rest] = argv;
  if (command === "-h" || command === "--help" || command === undefined) {
    throw new HelpRequested();
  }
  if (command !== "topology" || subcommand !== "push") {
    throw new Error(`Unknown command: ${argv.join(" ") || "(empty)"}`);
  }

  const options: CliOptions = { dryRun: false, json: false, cwd };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg) continue;
    if (arg === "-h" || arg === "--help") throw new HelpRequested();
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}.`);
    }
    index += 1;

    if (arg === "--entry") options.entry = value;
    else if (arg === "--export") options.exportName = value;
    else if (arg === "--api-url") options.apiUrl = value;
    else if (arg === "--api-key") options.apiKey = value;
    else if (arg === "--environment") options.environment = value;
    else if (arg === "--service-name") options.serviceName = value;
    else if (arg === "--deployment-ref") options.deploymentRef = value;
    else throw new Error(`Unknown option: ${arg}.`);
  }

  return options;
};

class HelpRequested extends Error {}

const readPackageName = async (cwd: string): Promise<string | undefined> => {
  let current = cwd;
  for (;;) {
    try {
      const raw = await readFile(join(current, "package.json"), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed) && typeof parsed.name === "string") {
        return parsed.name;
      }
    } catch {
      // Keep walking up until filesystem root.
    }

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
};

const loadEnvFiles = async (cwd: string): Promise<void> => {
  for (const filename of [".env", ".env.local"]) {
    const path = join(cwd, filename);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      continue;
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue;
      process.env[key] = unquoteEnvValue(trimmed.slice(separator + 1).trim());
    }
  }
};

const unquoteEnvValue = (value: string): string => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const resolveOptions = async (
  options: CliOptions,
): Promise<
  CliOptions & {
    entry: string;
    environment: string;
    serviceName: string;
    apiUrl?: string | undefined;
    apiKey?: string | undefined;
  }
> => {
  if (!options.entry) {
    throw new Error("Missing required option: --entry <path>.");
  }

  const entry = isAbsolute(options.entry)
    ? options.entry
    : resolve(options.cwd, options.entry);
  const environment =
    options.environment ??
    process.env.KORTYX_TELEMETRY_ENVIRONMENT ??
    process.env.NODE_ENV ??
    "development";
  const serviceName =
    options.serviceName ??
    process.env.KORTYX_TELEMETRY_SERVICE_NAME ??
    (await readPackageName(options.cwd)) ??
    "kortyx-app";

  return {
    ...options,
    entry,
    environment,
    serviceName,
    apiUrl:
      options.apiUrl ??
      process.env.KORTYX_TELEMETRY_API_URL ??
      process.env.KORTYX_API_URL,
    apiKey: options.apiKey ?? process.env.KORTYX_TELEMETRY_API_KEY,
    deploymentRef:
      options.deploymentRef ??
      process.env.KORTYX_TELEMETRY_DEPLOYMENT_REF ??
      process.env.GITHUB_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA,
  };
};

const createFrameworkMarkerStubs = async (): Promise<{
  cleanup: () => Promise<void>;
}> => {
  const root = await mkdtemp(join(tmpdir(), "kortyx-cli-stubs-"));
  for (const moduleName of ["server-only", "client-only"]) {
    const directory = join(root, moduleName);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.js"), "", "utf8");
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name: moduleName, version: "0.0.0", main: "index.js" }),
      "utf8",
    );
  }

  const previousNodePath = process.env.NODE_PATH;
  process.env.NODE_PATH = previousNodePath
    ? `${root}${delimiter}${previousNodePath}`
    : root;
  const moduleWithPrivateInit = Module as typeof Module & {
    _initPaths?: () => void;
  };
  moduleWithPrivateInit._initPaths?.();

  return {
    cleanup: async () => {
      if (previousNodePath === undefined) delete process.env.NODE_PATH;
      else process.env.NODE_PATH = previousNodePath;
      moduleWithPrivateInit._initPaths?.();
      await rm(root, { recursive: true, force: true });
    },
  };
};

const importEntry = async (entry: string): Promise<Record<string, unknown>> => {
  const stubs = await createFrameworkMarkerStubs();
  let unregisterPaths: (() => void) | undefined;
  try {
    const tsconfig = await findNearestFile(dirname(entry), "tsconfig.json");
    unregisterPaths = tsconfig
      ? await registerTsconfigPaths(tsconfig)
      : undefined;
    const module = tsxRequire(entry, join(dirname(entry), "kortyx-cli.cjs"));
    if (!isRecord(module)) {
      throw new Error(`Entry module did not export an object: ${entry}`);
    }
    return module;
  } finally {
    unregisterPaths?.();
    await stubs.cleanup();
  }
};

const findNearestFile = async (
  startDirectory: string,
  filename: string,
): Promise<string | undefined> => {
  let current = startDirectory;
  for (;;) {
    const candidate = join(current, filename);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
};

const registerTsconfigPaths = async (
  tsconfigPath: string,
): Promise<() => void> => {
  const raw = JSON.parse(await readFile(tsconfigPath, "utf8")) as unknown;
  if (!isRecord(raw)) return () => undefined;
  const compilerOptions = isRecord(raw.compilerOptions)
    ? raw.compilerOptions
    : undefined;
  const paths = isRecord(compilerOptions?.paths)
    ? compilerOptions.paths
    : undefined;
  if (!paths) return () => undefined;

  const tsconfigDirectory = dirname(tsconfigPath);
  const baseUrl =
    typeof compilerOptions?.baseUrl === "string"
      ? resolve(tsconfigDirectory, compilerOptions.baseUrl)
      : tsconfigDirectory;
  const mappings = Object.entries(paths)
    .flatMap(([pattern, rawTargets]) => {
      if (!Array.isArray(rawTargets)) return [];
      return rawTargets
        .filter((target): target is string => typeof target === "string")
        .map((target) => ({ pattern, target }));
    })
    .map(({ pattern, target }) => {
      const [patternPrefix, patternSuffix = ""] = pattern.split("*");
      const [targetPrefix, targetSuffix = ""] = target.split("*");
      return {
        pattern,
        target,
        patternPrefix,
        patternSuffix,
        targetPrefix,
        targetSuffix,
        wildcard: pattern.includes("*"),
      };
    });

  if (mappings.length === 0) return () => undefined;

  const moduleWithResolver = Module as typeof Module & {
    _resolveFilename: ModuleResolveFilename;
  };
  const originalResolve = moduleWithResolver._resolveFilename;
  moduleWithResolver._resolveFilename = function resolveWithTsconfigPaths(
    request,
    parent,
    isMain,
    options,
  ) {
    for (const mapping of mappings) {
      const matched = mapping.wildcard
        ? request.startsWith(mapping.patternPrefix ?? "") &&
          request.endsWith(mapping.patternSuffix)
        : request === mapping.pattern;
      if (!matched) continue;

      const wildcardValue = mapping.wildcard
        ? request.slice(
            mapping.patternPrefix?.length ?? 0,
            request.length - mapping.patternSuffix.length,
          )
        : "";
      const mapped = mapping.wildcard
        ? `${mapping.targetPrefix}${wildcardValue}${mapping.targetSuffix}`
        : mapping.target;
      for (const candidate of candidateModulePaths(resolve(baseUrl, mapped))) {
        try {
          return originalResolve.call(this, candidate, parent, isMain, options);
        } catch {
          // Try the next extension/index candidate.
        }
      }
    }

    return originalResolve.call(this, request, parent, isMain, options);
  };

  return () => {
    moduleWithResolver._resolveFilename = originalResolve;
  };
};

const candidateModulePaths = (basePath: string): string[] => [
  basePath,
  `${basePath}.ts`,
  `${basePath}.tsx`,
  `${basePath}.mts`,
  `${basePath}.cts`,
  `${basePath}.js`,
  `${basePath}.jsx`,
  join(basePath, "index.ts"),
  join(basePath, "index.tsx"),
  join(basePath, "index.js"),
  join(basePath, "index.jsx"),
];

const valueFromModule = (
  module: Record<string, unknown>,
  exportName: string | undefined,
): unknown => {
  if (exportName) {
    if (!(exportName in module)) {
      throw new Error(`Entry module does not export "${exportName}".`);
    }
    return module[exportName];
  }

  if (isAgent(module.agent)) return module.agent;
  if (Array.isArray(module.workflows)) return module.workflows;
  if (isAgent(module.default)) return module.default;
  if (Array.isArray(module.default)) return module.default;

  const workflowExports = Object.values(module).filter(isWorkflowDefinition);
  if (workflowExports.length > 0) return workflowExports;

  throw new Error(
    "Entry must export an agent with projectTopology(), a workflows array, or named workflow definitions. Use --export when needed.",
  );
};

const projectSnapshots = async (
  value: unknown,
  options: AgentProjectTopologyOptions,
): Promise<EnsureWorkflowTopologyRequest[]> => {
  if (isAgent(value)) {
    const snapshots = await value.projectTopology?.(options);
    return snapshots ?? [];
  }

  const workflows = Array.isArray(value)
    ? value.filter(isWorkflowDefinition)
    : isWorkflowDefinition(value)
      ? [value]
      : [];

  if (workflows.length === 0) {
    throw new Error("No workflow definitions found in the selected export.");
  }

  const knownWorkflowIds = workflows.map((workflow) => workflow.id);
  return workflows.map((workflow) =>
    projectWorkflowTopology({
      workflow,
      environment: options.environment,
      service: options.service,
      knownWorkflowIds,
    }),
  );
};

const endpointFor = (apiUrl: string, path: string): string =>
  `${apiUrl.replace(/\/$/, "")}${path}`;

const pushSnapshot = async (
  apiUrl: string,
  apiKey: string,
  snapshot: EnsureWorkflowTopologyRequest,
): Promise<EnsureWorkflowTopologyResponse> => {
  const response = await fetch(
    endpointFor(apiUrl, "/v1/telemetry/workflow-revisions:ensure"),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(snapshot),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Kortyx API rejected topology ${snapshot.workflow.id} (${response.status}): ${text}`,
    );
  }

  return EnsureWorkflowTopologyResponseSchema.parse(await response.json());
};

const printResults = (results: PushResult[], options: CliOptions): void => {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          workflows: results.map(({ snapshot, response }) => ({
            workflowId: snapshot.workflow.id,
            declaredVersion: snapshot.workflow.declaredVersion,
            topologyHash: snapshot.workflow.topologyHash,
            transitionCount: snapshot.workflow.transitions?.length ?? 0,
            workflowRevisionId: response?.workflowRevisionId,
            created: response?.created,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const verb = options.dryRun ? "Projected" : "Pushed";
  console.log(`${verb} ${results.length} workflow topology snapshot(s).`);
  for (const { snapshot, response } of results) {
    const revision = response
      ? ` revision=${response.workflowRevisionId} created=${response.created}`
      : "";
    console.log(
      `- ${snapshot.workflow.id}@${snapshot.workflow.declaredVersion} hash=${snapshot.workflow.topologyHash.slice(
        0,
        12,
      )} transitions=${snapshot.workflow.transitions?.length ?? 0}${revision}`,
    );
  }
};

const runTopologyPush = async (rawOptions: CliOptions): Promise<void> => {
  const options = await resolveOptions(rawOptions);
  if (!options.dryRun && !options.apiUrl) {
    throw new Error(
      "Missing Kortyx API URL. Pass --api-url or set KORTYX_TELEMETRY_API_URL.",
    );
  }
  if (!options.dryRun && !options.apiKey) {
    throw new Error(
      "Missing telemetry API key. Pass --api-key or set KORTYX_TELEMETRY_API_KEY.",
    );
  }

  const module = await importEntry(options.entry);
  const selected = valueFromModule(module, options.exportName);
  const service = {
    name: options.serviceName,
    ...(options.deploymentRef ? { deploymentRef: options.deploymentRef } : {}),
  };
  const snapshots = await projectSnapshots(selected, {
    environment: options.environment,
    service,
  });
  const parsedSnapshots = snapshots.map((snapshot) =>
    EnsureWorkflowTopologyRequestSchema.parse(snapshot),
  );

  const results: PushResult[] = [];
  for (const snapshot of parsedSnapshots) {
    let response: EnsureWorkflowTopologyResponse | undefined;
    if (!options.dryRun) {
      if (!options.apiUrl || !options.apiKey) {
        throw new Error("Missing Kortyx API URL or telemetry API key.");
      }
      response = await pushSnapshot(options.apiUrl, options.apiKey, snapshot);
    }
    results.push({ snapshot, ...(response ? { response } : {}) });
  }

  printResults(results, options);
};

const main = async (): Promise<void> => {
  try {
    const options = parseArgs(process.argv.slice(2));
    await loadEnvFiles(options.cwd);
    await runTopologyPush(options);
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(commandHelp);
      return;
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

void main();
