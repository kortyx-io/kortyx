import { StudioContextResponseSchema } from "@kortyx/telemetry-contracts";
import { Command } from "commander";
import {
  type ConnectionProfile,
  defaultConnectionsHome,
  readConnections,
  readKeyEnv,
  saveConnections,
} from "./connections";
import {
  normalizeConnectionUrl,
  StudioReadClient,
  StudioReadError,
} from "./studio/read-client";
import { defaultStudioHome, readStudioConfig } from "./studio/state";

type Options = {
  configHome: string;
  home: string;
  json?: boolean;
  apiUrl?: string;
  studioUrl?: string;
  apiKeyEnv?: string;
  environment?: string;
  replace?: boolean;
};
export const createConnectionsCommand = (
  log: (message: string) => void = console.log,
  request: typeof fetch = fetch,
) => {
  const command = new Command("connections").description(
    "Manage Studio connection profiles (no remote mutations or stored secrets).",
  );
  const common = (child: Command) =>
    child
      .option(
        "--config-home <path>",
        "Connection configuration directory.",
        defaultConnectionsHome(),
      )
      .option(
        "--home <path>",
        "Managed local Studio directory.",
        defaultStudioHome(),
      )
      .option("--json", "Print machine-readable JSON.");
  const print = (value: unknown, options: Options) =>
    log(JSON.stringify(value, null, options.json ? 0 : 2));
  common(
    command
      .command("list")
      .description("List profiles without reading or displaying their keys."),
  ).action(async (options: Options) => {
    const config = await readConnections(options.configHome);
    const local = await readStudioConfig(options.home);
    print(
      {
        current: config.current ?? "local",
        connections: [
          ...(local
            ? [
                {
                  name: "local",
                  apiUrl: `http://localhost:${local.apiPort}`,
                  studioUrl: `http://localhost:${local.studioPort}`,
                  credential: "managed-local",
                },
              ]
            : []),
          ...config.profiles,
        ],
      },
      options,
    );
  });
  common(
    command
      .command("add <name>")
      .description(
        "Validate a read key and save URL locators plus an environment-variable reference.",
      )
      .requiredOption(
        "--api-url <url>",
        "Studio API base URL (not the browser URL).",
      )
      .requiredOption(
        "--api-key-env <name>",
        "Environment variable containing the project-scoped read key.",
      )
      .option(
        "--studio-url <url>",
        "Studio browser base URL, used to resolve pasted links.",
      )
      .option("--environment <name>", "Default environment filter for lists.")
      .option("--replace", "Explicitly replace an existing named connection."),
  ).action(
    async (
      name: string,
      options: Options & { apiUrl: string; apiKeyEnv: string },
    ) => {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name) || name === "local") {
        throw new StudioReadError(
          "invalid_name",
          "Use a connection name of 1–64 letters, digits, hyphens or underscores; local is reserved.",
        );
      }
      const config = await readConnections(options.configHome);
      if (
        config.profiles.some((profile) => profile.name === name) &&
        !options.replace
      ) {
        throw new StudioReadError(
          "connection_exists",
          "Connection already exists. Use --replace to update it.",
        );
      }
      const apiUrl = normalizeConnectionUrl(options.apiUrl);
      const studioUrl = options.studioUrl
        ? normalizeConnectionUrl(options.studioUrl)
        : undefined;
      const client = new StudioReadClient(
        apiUrl,
        readKeyEnv(options.apiKeyEnv),
        request,
      );
      const context = await client.get(
        "/v1/studio/context",
        StudioContextResponseSchema,
      );
      if (!context.apiKey.scopes.includes("studio:read"))
        throw new StudioReadError(
          "missing_scope",
          "The API key lacks studio:read permission.",
        );
      const profile: ConnectionProfile = {
        name,
        apiUrl,
        apiKeyEnv: options.apiKeyEnv,
        project: context.project.name,
        organization: context.organization.name,
        ...(studioUrl ? { studioUrl } : {}),
        ...(options.environment ? { environment: options.environment } : {}),
      };
      config.profiles = [
        ...config.profiles.filter((item) => item.name !== name),
        profile,
      ];
      await saveConnections(config, options.configHome);
      print({ connection: profile, verified: true }, options);
    },
  );
  common(
    command
      .command("use <name>")
      .description(
        "Select the default connection; agents should prefer per-command --connection.",
      ),
  ).action(async (name: string, options: Options) => {
    const config = await readConnections(options.configHome);
    if (
      name === "local"
        ? !(await readStudioConfig(options.home))
        : !config.profiles.some((profile) => profile.name === name)
    ) {
      throw new StudioReadError(
        "unknown_connection",
        "Connection not found. Run kortyx connections list.",
      );
    }
    config.current = name;
    await saveConnections(config, options.configHome);
    print({ current: name }, options);
  });
  common(
    command
      .command("remove <name>")
      .description(
        "Remove a saved locator, not its credential or remote project.",
      ),
  ).action(async (name: string, options: Options) => {
    const config = await readConnections(options.configHome);
    if (!config.profiles.some((profile) => profile.name === name))
      throw new StudioReadError(
        "unknown_connection",
        "Saved connection not found; managed local cannot be removed.",
      );
    config.profiles = config.profiles.filter(
      (profile) => profile.name !== name,
    );
    if (config.current === name) delete config.current;
    await saveConnections(config, options.configHome);
    print({ removed: name }, options);
  });
  return command;
};
