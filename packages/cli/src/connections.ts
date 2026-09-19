import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { normalizeConnectionUrl, StudioReadError } from "./studio/read-client";
import {
  defaultStudioHome,
  readStudioConfig,
  readStudioEnvironment,
} from "./studio/state";

const ProfileSchema = z
  .object({
    name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
    apiUrl: z.string(),
    studioUrl: z.string().optional(),
    apiKeyEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    environment: z.string().min(1).optional(),
    project: z.string(),
    organization: z.string(),
  })
  .strict();
const ConfigSchema = z
  .object({
    version: z.literal(1),
    current: z.string().optional(),
    profiles: z.array(ProfileSchema),
  })
  .strict()
  .superRefine((config, ctx) => {
    const names = config.profiles.map((profile) => profile.name);
    if (
      names.includes("local") ||
      new Set(names).size !== names.length ||
      (config.current &&
        config.current !== "local" &&
        !names.includes(config.current))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid connection names or selection.",
      });
    }
  });
export type ConnectionProfile = z.infer<typeof ProfileSchema>;
export type ConnectionConfig = z.infer<typeof ConfigSchema>;
export type ConnectionOptions = {
  connection?: string | undefined;
  apiUrl?: string | undefined;
  apiKeyEnv?: string | undefined;
  configHome?: string | undefined;
  home?: string | undefined;
};
export type ResolvedConnection = {
  name: string;
  apiUrl: string;
  studioUrl?: string | undefined;
  environment?: string | undefined;
  apiKey: string;
};

export const defaultConnectionsHome = () =>
  resolve(process.env.KORTYX_CONFIG_HOME ?? join(homedir(), ".kortyx"));
export const readConnections = async (
  home = defaultConnectionsHome(),
): Promise<ConnectionConfig> => {
  try {
    const result = ConfigSchema.safeParse(
      JSON.parse(await readFile(join(home, "connections.json"), "utf8")),
    );
    if (!result.success) throw new Error("invalid");
    for (const profile of result.data.profiles) {
      normalizeConnectionUrl(profile.apiUrl);
      if (profile.studioUrl) normalizeConnectionUrl(profile.studioUrl);
    }
    return result.data;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { version: 1, profiles: [] };
    throw new StudioReadError(
      "invalid_config",
      "Invalid or unreadable connections.json. Fix the configuration; it will not be overwritten.",
    );
  }
};

export const saveConnections = async (
  config: ConnectionConfig,
  home = defaultConnectionsHome(),
) => {
  const result = ConfigSchema.safeParse(config);
  if (!result.success)
    throw new StudioReadError(
      "invalid_config",
      "Invalid connection name or configuration.",
    );
  await mkdir(home, { recursive: true, mode: 0o700 });
  const temporary = join(home, `.connections-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(result.data, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, join(home, "connections.json"));
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
};

const urlMatches = (target: URL, base: string) => {
  const url = new URL(base);
  const prefix = url.pathname.replace(/\/+$/, "");
  return (
    target.origin === url.origin &&
    (target.pathname === prefix || target.pathname.startsWith(`${prefix}/`))
  );
};

export const resolveConnection = async (
  options: ConnectionOptions,
  targetUrl?: string,
): Promise<ResolvedConnection> => {
  const config = await readConnections(options.configHome);
  const local = await readStudioConfig(options.home ?? defaultStudioHome());
  const localLocator = local
    ? {
        name: "local",
        apiUrl: `http://localhost:${local.apiPort}`,
        studioUrl: `http://localhost:${local.studioPort}`,
      }
    : undefined;
  let selected =
    options.connection ?? (process.env.KORTYX_CONNECTION || undefined);
  if (options.apiUrl || options.apiKeyEnv) {
    if (selected || !options.apiUrl || !options.apiKeyEnv) {
      throw new StudioReadError(
        "invalid_connection",
        "Direct connections require both --api-url and --api-key-env, without --connection/KORTYX_CONNECTION. Keys are never reused for URL overrides.",
      );
    }
    if (targetUrl)
      throw new StudioReadError(
        "unmapped_url",
        "Register a connection with --studio-url before inspecting a URL. Direct connections accept entity IDs only.",
      );
    return {
      name: "direct",
      apiUrl: normalizeConnectionUrl(options.apiUrl),
      apiKey: readKeyEnv(options.apiKeyEnv),
    };
  }
  const locators = [
    ...config.profiles,
    ...(localLocator ? [localLocator] : []),
  ];
  if (targetUrl) {
    const target = new URL(targetUrl);
    const matches = locators.filter(
      (profile) =>
        urlMatches(target, profile.apiUrl) ||
        (profile.studioUrl && urlMatches(target, profile.studioUrl)),
    );
    if (selected) {
      if (!matches.some((profile) => profile.name === selected)) {
        throw new StudioReadError(
          "connection_mismatch",
          "The supplied URL does not match the selected connection's API or Studio URL.",
        );
      }
    } else if (matches.length === 1) selected = matches[0]?.name;
    else
      throw new StudioReadError(
        "unmapped_url",
        matches.length
          ? "URL matches multiple projects. Specify --connection explicitly."
          : "URL does not match a configured connection. Add one with the correct --studio-url.",
      );
  }
  selected ??= config.current ?? "local";
  if (selected === "local") {
    if (!localLocator)
      throw new StudioReadError(
        "not_configured",
        "Local Studio is not configured. Run kortyx studio start or select a remote connection.",
      );
    const environment = await readStudioEnvironment(
      options.home ?? defaultStudioHome(),
    );
    return { ...localLocator, apiKey: environment.KORTYX_STUDIO_API_KEY };
  }
  const profile = config.profiles.find((item) => item.name === selected);
  if (!profile)
    throw new StudioReadError(
      "unknown_connection",
      "Connection not found. Run kortyx connections list.",
    );
  return {
    name: profile.name,
    apiUrl: profile.apiUrl,
    studioUrl: profile.studioUrl,
    environment: profile.environment,
    apiKey: readKeyEnv(profile.apiKeyEnv),
  };
};

export const readKeyEnv = (name: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new StudioReadError(
      "invalid_key_env",
      "Provide a valid environment variable name.",
    );
  const value = process.env[name];
  if (!value)
    throw new StudioReadError(
      "missing_key",
      `Set ${name} to a project-scoped Studio read key. Do not use the telemetry write key.`,
    );
  return value;
};
