import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { STUDIO_COMPOSE_FILE } from "./compose";
import type { StudioRuntime, StudioStartOptions } from "./types";

const CONFIG_VERSION = 1;
const DEFAULT_API_PORT = 6400;
const DEFAULT_STUDIO_PORT = 6300;
const DEFAULT_IMAGE_TAG = "latest";
const DEFAULT_USERNAME = "admin";
const DEFAULT_PROJECT_NAME = "kortyx-studio";

const PortSchema = z.number().int().min(1).max(65_535);

const StudioConfigSchema = z
  .object({
    version: z.literal(CONFIG_VERSION),
    apiPort: PortSchema,
    studioPort: PortSchema,
    imageTag: z
      .string()
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
        "Image tag contains unsupported characters.",
      ),
    username: z
      .string()
      .regex(/^[A-Za-z0-9._@-]+$/, "Username contains unsupported characters."),
    projectName: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9_-]*$/,
        "Docker Compose project name contains unsupported characters.",
      ),
    createdAt: z.iso.datetime(),
  })
  .refine((config) => config.apiPort !== config.studioPort, {
    message: "Studio and API ports must be different.",
    path: ["apiPort"],
  });

const ApiKeySchema = z
  .string()
  .regex(/^ktyx_(?:test|live)_[^_]+_.+$/, "Invalid Kortyx API key.");

const StudioEnvironmentSchema = z
  .object({
    KORTYX_COMPOSE_PROJECT_NAME: z.string().min(1),
    KORTYX_STUDIO_IMAGE_TAG: z.string().min(1),
    API_PORT: z.string().regex(/^\d+$/),
    STUDIO_PORT: z.string().regex(/^\d+$/),
    POSTGRES_PASSWORD: z.string().min(16),
    KORTYX_API_KEY_PEPPER: z.string().min(16),
    KORTYX_TELEMETRY_API_KEY: ApiKeySchema,
    KORTYX_STUDIO_API_KEY: ApiKeySchema,
    KORTYX_STUDIO_BASIC_AUTH_USERNAME: z.string().min(1),
    KORTYX_STUDIO_BASIC_AUTH_PASSWORD: z.string().min(12),
  })
  .passthrough();

export type StudioConfig = z.infer<typeof StudioConfigSchema>;
export type StudioEnvironment = z.infer<typeof StudioEnvironmentSchema>;
export type StudioDeploymentCredentials = Pick<
  StudioEnvironment,
  | "KORTYX_API_KEY_PEPPER"
  | "KORTYX_TELEMETRY_API_KEY"
  | "KORTYX_STUDIO_API_KEY"
  | "KORTYX_STUDIO_BASIC_AUTH_USERNAME"
  | "KORTYX_STUDIO_BASIC_AUTH_PASSWORD"
>;

export const defaultStudioHome = (): string =>
  resolve(
    process.env.KORTYX_STUDIO_HOME ?? join(homedir(), ".kortyx", "studio"),
  );

export const studioConfigPath = (home: string): string =>
  join(home, "config.json");
export const studioEnvPath = (home: string): string => join(home, ".env");
export const studioComposePath = (home: string): string =>
  join(home, "compose.yml");

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const invalidStateError = (
  label: string,
  path: string,
  error: z.ZodError,
): Error =>
  new Error(
    `Unsupported or invalid Studio ${label} at ${path}.\n${z.prettifyError(error)}`,
  );

export const readStudioConfig = async (
  home: string,
): Promise<StudioConfig | undefined> => {
  try {
    const parsed = JSON.parse(
      await readFile(studioConfigPath(home), "utf8"),
    ) as unknown;
    const result = StudioConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw invalidStateError("config", studioConfigPath(home), result.error);
    }
    return result.data;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
};

const resolveConfig = (
  existing: StudioConfig | undefined,
  options: StudioStartOptions,
  runtime: StudioRuntime,
): StudioConfig => {
  const result = StudioConfigSchema.safeParse({
    version: CONFIG_VERSION,
    apiPort: options.apiPort ?? existing?.apiPort ?? DEFAULT_API_PORT,
    studioPort:
      options.studioPort ?? existing?.studioPort ?? DEFAULT_STUDIO_PORT,
    imageTag: options.imageTag ?? existing?.imageTag ?? DEFAULT_IMAGE_TAG,
    username: options.username ?? existing?.username ?? DEFAULT_USERNAME,
    projectName:
      options.projectName ?? existing?.projectName ?? DEFAULT_PROJECT_NAME,
    createdAt: existing?.createdAt ?? runtime.now(),
  });
  if (!result.success) {
    throw new Error(
      `Invalid Studio configuration.\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
};

const createApiKey = (purpose: string, runtime: StudioRuntime): string =>
  `ktyx_live_${purpose}${runtime.random(6).toLowerCase()}_${runtime.random(32)}`;

export const createStudioDeploymentCredentials = (
  runtime: StudioRuntime,
  username = DEFAULT_USERNAME,
): StudioDeploymentCredentials => ({
  KORTYX_API_KEY_PEPPER: runtime.random(48),
  KORTYX_TELEMETRY_API_KEY: createApiKey("telemetry", runtime),
  KORTYX_STUDIO_API_KEY: createApiKey("studio", runtime),
  KORTYX_STUDIO_BASIC_AUTH_USERNAME: username,
  KORTYX_STUDIO_BASIC_AUTH_PASSWORD: runtime.random(24),
});

const createEnvironment = (
  config: StudioConfig,
  runtime: StudioRuntime,
): StudioEnvironment =>
  StudioEnvironmentSchema.parse({
    KORTYX_COMPOSE_PROJECT_NAME: config.projectName,
    KORTYX_STUDIO_IMAGE_TAG: config.imageTag,
    API_PORT: String(config.apiPort),
    STUDIO_PORT: String(config.studioPort),
    POSTGRES_PASSWORD: runtime.random(32),
    ...createStudioDeploymentCredentials(runtime, config.username),
  });

const parseEnvironmentFile = (raw: string, path: string): StudioEnvironment => {
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid environment entry in ${path}: ${line}`);
    }
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }

  const result = StudioEnvironmentSchema.safeParse(values);
  if (!result.success) {
    throw invalidStateError("environment", path, result.error);
  }
  return result.data;
};

const serializeEnvironment = (environment: StudioEnvironment): string =>
  `${Object.entries(environment)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;

const writePrivateFileAtomically = async (
  path: string,
  contents: string,
): Promise<void> => {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  let renamed = false;
  try {
    await writeFile(temporaryPath, contents, { mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    renamed = true;
    await chmod(path, 0o600);
  } finally {
    if (!renamed) {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
};

export const readStudioEnvironment = async (
  home: string,
): Promise<StudioEnvironment> => {
  const path = studioEnvPath(home);
  return parseEnvironmentFile(await readFile(path, "utf8"), path);
};

export const writeStudioEnvironment = async (
  home: string,
  environment: StudioEnvironment,
): Promise<void> => {
  const parsed = StudioEnvironmentSchema.parse(environment);
  await writePrivateFileAtomically(
    studioEnvPath(home),
    serializeEnvironment(parsed),
  );
};

const rotateApiKeySecret = (apiKey: string, runtime: StudioRuntime): string => {
  const match = /^(ktyx_(?:test|live)_[^_]+_).+$/.exec(apiKey);
  const prefix = match?.[1];
  if (!prefix) throw new Error("Stored Kortyx API key has an invalid format.");
  return `${prefix}${runtime.random(32)}`;
};

export const createRotatedStudioEnvironment = (
  environment: StudioEnvironment,
  runtime: StudioRuntime,
): StudioEnvironment =>
  StudioEnvironmentSchema.parse({
    ...environment,
    KORTYX_TELEMETRY_API_KEY: rotateApiKeySecret(
      environment.KORTYX_TELEMETRY_API_KEY,
      runtime,
    ),
    KORTYX_STUDIO_API_KEY: rotateApiKeySecret(
      environment.KORTYX_STUDIO_API_KEY,
      runtime,
    ),
    KORTYX_STUDIO_BASIC_AUTH_PASSWORD: runtime.random(24),
  });

export const ensureStudioState = async (
  options: StudioStartOptions,
  runtime: StudioRuntime,
): Promise<StudioConfig> => {
  await mkdir(options.home, { recursive: true, mode: 0o700 });
  await chmod(options.home, 0o700);
  const existing = await readStudioConfig(options.home);
  const config = resolveConfig(existing, options, runtime);

  await writeFile(
    studioConfigPath(options.home),
    `${JSON.stringify(config, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(studioConfigPath(options.home), 0o600);
  await writeFile(studioComposePath(options.home), STUDIO_COMPOSE_FILE, {
    mode: 0o600,
  });
  await chmod(studioComposePath(options.home), 0o600);

  let environment: StudioEnvironment;
  try {
    environment = await readStudioEnvironment(options.home);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    environment = createEnvironment(config, runtime);
  }

  const updatedEnvironment = StudioEnvironmentSchema.parse({
    ...environment,
    KORTYX_COMPOSE_PROJECT_NAME: config.projectName,
    KORTYX_STUDIO_IMAGE_TAG: config.imageTag,
    API_PORT: String(config.apiPort),
    STUDIO_PORT: String(config.studioPort),
    KORTYX_STUDIO_BASIC_AUTH_USERNAME: config.username,
  });
  await writeStudioEnvironment(options.home, updatedEnvironment);
  return config;
};

export const requireStudioConfig = async (
  home: string,
): Promise<StudioConfig> => {
  const config = await readStudioConfig(home);
  if (!config) {
    throw new Error(
      `Kortyx Studio is not initialized at ${home}. Run "kortyx studio start" first.`,
    );
  }
  return config;
};
