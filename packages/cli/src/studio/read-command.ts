import {
  projectWorkflowCalls,
  resolveStudioTimeRange,
  StudioCatalogsResponseSchema,
  StudioContextResponseSchema,
  StudioInterruptDetailResponseSchema,
  StudioInterruptsResponseSchema,
  StudioRunDetailResponseSchema,
  StudioRunsResponseSchema,
  StudioSessionDetailResponseSchema,
  StudioSessionsResponseSchema,
  StudioTimeRangeSchema,
  StudioWorkflowsResponseSchema,
} from "@kortyx/telemetry-contracts";
import { type Command, InvalidArgumentError, Option } from "commander";
import {
  type ConnectionOptions,
  defaultConnectionsHome,
  resolveConnection,
} from "../connections";
import { StudioReadClient, StudioReadError } from "./read-client";
import {
  formatReadOutput,
  parseStudioTarget,
  type StudioEntity,
  sanitizeStudioData,
  summarizeEvidence,
} from "./read-output";
import { defaultStudioHome } from "./state";

type ReadOptions = ConnectionOptions & {
  json?: boolean;
  includeContent?: boolean;
  eventLimit?: number;
  limit?: number;
  cursor?: number;
  environment?: string;
  range?: string;
  startedAfter?: string;
  startedBefore?: string;
  status?: string;
  workflow?: string;
  session?: string;
  user?: string;
  tenant?: string;
  model?: string;
  node?: string;
  tool?: string;
  toolOutcome?: string;
  q?: string;
  includeChildren?: boolean;
};
type DetailOptions = ReadOptions & { eventLimit: number };
type CohortOptions = ReadOptions & { range: string };
type ListOptions = CohortOptions & { limit: number; cursor: number };
const integer = (min: number, max: number) => (value: string) => {
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  ) {
    throw new InvalidArgumentError(
      `Expected an integer between ${min} and ${max}.`,
    );
  }
  return Number(value);
};
const rangeAliases: Record<string, string> = {
  "1h": "Last hour",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};
export const registerStudioReadCommands = (
  studio: Command,
  log: (message: string) => void,
  request: typeof fetch = fetch,
) => {
  const common = (command: Command) =>
    command
      .option(
        "--connection <name>",
        "Named project/URL connection (or KORTYX_CONNECTION).",
      )
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
      .option(
        "--api-url <url>",
        "Direct API URL; requires --api-key-env. Never reuses a profile key.",
      )
      .option(
        "--api-key-env <name>",
        "Environment variable holding a direct connection read key.",
      )
      .option("--json", "Print stable machine-readable JSON.")
      .option(
        "--include-content",
        "Include captured input/output and prompts (may contain sensitive data).",
      );
  const print = (value: unknown, options: ReadOptions) =>
    log(
      formatReadOutput(
        sanitizeStudioData(value, options.includeContent ?? false),
        options.json ?? false,
      ),
    );
  const clientFor = async (options: ReadOptions, targetUrl?: string) => {
    const connection = await resolveConnection(options, targetUrl);
    return {
      connection,
      client: new StudioReadClient(
        connection.apiUrl,
        connection.apiKey,
        request,
      ),
    };
  };
  const inspect = async (
    input: string,
    options: DetailOptions,
    entity?: StudioEntity,
  ) => {
    const target = parseStudioTarget(input, entity);
    const { connection, client } = await clientFor(options, target.url);
    const context = await client.get(
      "/v1/studio/context",
      StudioContextResponseSchema,
    );
    // Branch types have separate schemas; avoid relaxing validation to generic JSON.
    const path = `/v1/studio/${target.entity}/${encodeURIComponent(target.id)}`;
    const detail =
      target.entity === "runs"
        ? await client.get(path, StudioRunDetailResponseSchema)
        : target.entity === "sessions"
          ? await client.get(path, StudioSessionDetailResponseSchema)
          : await client.get(path, StudioInterruptDetailResponseSchema);
    const limit = options.eventLimit;
    const events = [...detail.events].sort(
      (a, b) =>
        Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
        Date.parse(a.receivedAt) - Date.parse(b.receivedAt) ||
        a.id.localeCompare(b.id),
    );
    const evidence = summarizeEvidence(events);
    const calls = projectWorkflowCalls(events);
    print(
      {
        schemaVersion: 1,
        connection: {
          name: connection.name,
          apiUrl: connection.apiUrl,
          context,
        },
        target,
        detail: { ...detail, events: events.slice(-limit) },
        calls: calls.slice(-limit).map(({ events: callEvents, ...call }) => ({
          ...call,
          eventIds: callEvents.map((event) => event.id),
        })),
        diagnostics: {
          ...evidence,
          findings: evidence.findings.slice(-limit),
          findingCount: evidence.findings.length,
          findingsOmitted: Math.max(0, evidence.findings.length - limit),
        },
        coverage: {
          returnedEvents: Math.min(events.length, limit),
          availableEvents: events.length,
          omittedEvents: Math.max(0, events.length - limit),
          eventWindow: "latest",
          contentIncluded: options.includeContent ?? false,
          availableCalls: calls.length,
          omittedCalls: Math.max(0, calls.length - limit),
          note: "Available events are those returned by Studio, not a guarantee of complete runtime history. Content capture is opt-in; secrets are redacted on a best-effort basis even with --include-content.",
        },
      },
      options,
    );
  };
  const detailOptions = (command: Command) =>
    common(command).option(
      "--event-limit <count>",
      "Maximum latest events and diagnostic findings (1–10000).",
      integer(1, 10_000),
      100,
    );
  detailOptions(
    studio
      .command("inspect <url>")
      .description(
        "Inspect a pasted run/session/interrupt URL using a matching configured connection.",
      ),
  ).action((input: string, options: DetailOptions) => inspect(input, options));
  common(
    studio
      .command("doctor")
      .description(
        "Verify the read credential, project, environments, and API compatibility.",
      ),
  ).action(async (options: ReadOptions) => {
    const { connection, client } = await clientFor(options);
    const context = await client.get(
      "/v1/studio/context",
      StudioContextResponseSchema,
    );
    print(
      {
        schemaVersion: 1,
        connection: connection.name,
        apiUrl: connection.apiUrl,
        context,
      },
      options,
    );
  });
  common(
    studio
      .command("catalogs")
      .description(
        "Read available environment/provider/model/workflow/tag filters.",
      ),
  ).action(async (options: ReadOptions) => {
    const { connection, client } = await clientFor(options);
    print(
      {
        schemaVersion: 1,
        connection: connection.name,
        data: await client.get(
          "/v1/studio/catalogs",
          StudioCatalogsResponseSchema,
        ),
      },
      options,
    );
  });
  const filters = (command: Command) =>
    common(command)
      .option(
        "--environment <name>",
        "Environment filter; overrides the connection default.",
      )
      .addOption(
        new Option(
          "--range <range>",
          "Studio time range: 1h, 24h, 7d, 30d, all (or Studio preset name).",
        )
          .choices([
            ...Object.keys(rangeAliases),
            ...StudioTimeRangeSchema.options,
          ])
          .default("24h"),
      )
      .option(
        "--started-after <iso>",
        "Explicit start boundary (requires --started-before).",
      )
      .option(
        "--started-before <iso>",
        "Explicit end boundary (requires --started-after).",
      )
      .option("--workflow <id>", "Workflow filter.");
  const timeQuery = (options: CohortOptions): Record<string, string> => {
    const custom = Boolean(options.startedAfter || options.startedBefore);
    const range = custom
      ? "Custom range"
      : (rangeAliases[options.range] ?? options.range);
    const resolution = resolveStudioTimeRange({
      range,
      startedAfter: options.startedAfter,
      startedBefore: options.startedBefore,
    });
    if ("error" in resolution)
      throw new StudioReadError("invalid_time_range", resolution.error);
    return custom
      ? {
          range,
          startedAfter: String(resolution.value.startedAfter),
          startedBefore: String(resolution.value.startedBefore),
        }
      : { range };
  };
  for (const entity of ["runs", "sessions", "interrupts"] as const) {
    const group = studio.command(entity).description(`Read Studio ${entity}.`);
    detailOptions(
      group
        .command("get <id-or-url>")
        .description("Read detail, events, and diagnostic evidence."),
    ).action((input: string, options: DetailOptions) =>
      inspect(input, options, entity),
    );
    const list = filters(
      group.command("list").description("Read a bounded, filtered page."),
    )
      .option("--limit <count>", "Page size (1–100).", integer(1, 100), 25)
      .option(
        "--cursor <offset>",
        "Numeric offset returned as nextCursor.",
        integer(0, Number.MAX_SAFE_INTEGER),
        0,
      )
      .option("--status <status>", "Entity status filter.")
      .option("--session <id>", "Session filter.")
      .option("--user <id>", "User filter.")
      .option("--tenant <id>", "Tenant filter.")
      .option("--model <name>", "Model filter.")
      .option("--node <id>", "Node filter.")
      .option("--tool <name>", "Tool name filter.")
      .addOption(
        new Option("--tool-outcome <outcome>", "Tool outcome filter.").choices([
          "success",
          "denied",
          "fault",
          "cancelled",
          "reused",
        ]),
      )
      .option("--q <text>", "Search filter.")
      .option("--include-children", "Include child workflow runs.");
    list.action(async (options: ListOptions) => {
      const query: Record<string, string> = timeQuery(options);
      const { connection, client } = await clientFor(options);
      const environment = options.environment ?? connection.environment;
      if (environment) query.env = environment;
      for (const key of [
        "status",
        "workflow",
        "session",
        "user",
        "tenant",
        "model",
        "node",
        "tool",
        "toolOutcome",
        "q",
      ] as const) {
        const value = options[key];
        if (value) query[key] = value;
      }
      query.pageSize = String(options.limit);
      query.cursor = String(options.cursor);
      if (options.includeChildren) query.includeChildren = "true";
      const path = `/v1/studio/${entity}`;
      const data =
        entity === "runs"
          ? await client.get(path, StudioRunsResponseSchema, query)
          : entity === "sessions"
            ? await client.get(path, StudioSessionsResponseSchema, query)
            : await client.get(path, StudioInterruptsResponseSchema, query);
      const items =
        "runs" in data
          ? data.runs
          : "sessions" in data
            ? data.sessions
            : data.interrupts;
      const next = options.cursor + items.length;
      print(
        {
          schemaVersion: 1,
          connection: connection.name,
          data,
          page: {
            cursor: options.cursor,
            limit: options.limit,
            nextCursor: items.length && next < data.totalCount ? next : null,
          },
        },
        options,
      );
    });
  }
  const workflows = studio
    .command("workflows")
    .description("Read declared topology and observed workflow metrics.");
  filters(
    workflows
      .command("list")
      .description("Read workflow topology in a time cohort."),
  )
    .option("--version <version>", "Declared version filter.")
    .action(async (options: CohortOptions & { version?: string }) => {
      if (options.environment)
        throw new StudioReadError(
          "unsupported_filter",
          "The workflow API does not currently support environment filtering.",
        );
      const query: Record<string, string> = timeQuery(options);
      if (options.workflow) query.workflow = options.workflow;
      if (options.version) query.version = options.version;
      const { connection, client } = await clientFor(options);
      print(
        {
          schemaVersion: 1,
          connection: connection.name,
          data: await client.get(
            "/v1/studio/workflows",
            StudioWorkflowsResponseSchema,
            query,
          ),
          note: "Workflow metrics span environments; connection environment defaults are not applied by this API.",
        },
        options,
      );
    });
};
