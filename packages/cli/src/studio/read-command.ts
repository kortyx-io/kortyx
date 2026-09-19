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
import {
  analyzeStudioDiagnostics,
  buildStudioTimeline,
  type CatalogDrift,
  compareCatalogRuntime,
  compareRunAnalysis,
  focusStudioEvents,
} from "./read-analysis";
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
  focusSelection?: boolean;
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
    const focus = options.focusSelection
      ? focusStudioEvents(events, target)
      : { events, applied: {} };
    const selectedEvents = focus.events;
    const evidence = summarizeEvidence(selectedEvents);
    const run = "run" in detail ? detail.run : null;
    const interrupts =
      "interrupts" in detail
        ? detail.interrupts
        : "interrupt" in detail
          ? [detail.interrupt]
          : [];
    const analyzedFindings = analyzeStudioDiagnostics(
      selectedEvents,
      run,
      interrupts,
    );
    const supersededEventIds = new Set(
      analyzedFindings.flatMap((finding) => finding.eventIds),
    );
    const findings = [
      ...evidence.findings.filter(
        (finding) => !supersededEventIds.has(finding.eventId),
      ),
      ...analyzedFindings,
    ];
    const calls = projectWorkflowCalls(selectedEvents);
    let catalog: CatalogDrift | undefined;
    if (target.entity === "runs" && run) {
      try {
        const workflows = await client.get(
          "/v1/studio/workflows",
          StudioWorkflowsResponseSchema,
          { range: "All time", workflow: run.workflowId },
        );
        catalog = compareCatalogRuntime(run, workflows.workflows);
      } catch (error) {
        catalog = {
          status: "unavailable",
          workflows: [],
          reason:
            error instanceof StudioReadError
              ? error.code
              : "catalog_comparison_failed",
        };
      }
    }
    const catalogFinding =
      catalog?.status === "drift"
        ? [
            {
              code: "catalog_runtime_drift",
              severity: "warning" as const,
              message:
                "The executed workflow revision differs from the currently active catalog revision.",
              eventIds: [],
              evidence: catalog.workflows,
            },
          ]
        : [];
    const allFindings = [...findings, ...catalogFinding];
    print(
      {
        schemaVersion: 1,
        connection: {
          name: connection.name,
          apiUrl: connection.apiUrl,
          context,
        },
        target,
        detail: { ...detail, events: selectedEvents.slice(-limit) },
        timeline: buildStudioTimeline(selectedEvents, interrupts).slice(-limit),
        calls: calls.slice(-limit).map(({ events: callEvents, ...call }) => ({
          ...call,
          eventIds: callEvents.map((event) => event.id),
        })),
        diagnostics: {
          ...evidence,
          findings: allFindings.slice(-limit),
          findingCount: allFindings.length,
          findingsOmitted: Math.max(0, allFindings.length - limit),
        },
        ...(catalog ? { catalog } : {}),
        coverage: {
          returnedEvents: Math.min(selectedEvents.length, limit),
          availableEvents: selectedEvents.length,
          omittedEvents: Math.max(0, selectedEvents.length - limit),
          eventWindow: "latest",
          selectionFocus: options.focusSelection
            ? {
                applied: focus.applied,
                matchedEvents: selectedEvents.length,
                totalEvents: events.length,
              }
            : null,
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
    common(command)
      .option(
        "--event-limit <count>",
        "Maximum latest events and diagnostic findings (1–10000).",
        integer(1, 10_000),
        100,
      )
      .option(
        "--focus-selection",
        "Focus events using call/event/branch/node/trace selectors from the URL.",
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
    if (entity === "runs") {
      common(
        group
          .command("compare <left-id-or-url> <right-id-or-url>")
          .description(
            "Compare two runs' versions, outcomes, and compact execution timelines.",
          ),
      )
        .option(
          "--event-limit <count>",
          "Maximum timeline steps returned per run (1–10000).",
          integer(1, 10_000),
          100,
        )
        .action(
          async (
            leftInput: string,
            rightInput: string,
            options: DetailOptions,
          ) => {
            const leftTarget = parseStudioTarget(leftInput, "runs");
            const rightTarget = parseStudioTarget(rightInput, "runs");
            const { connection, client } = await clientFor(
              options,
              leftTarget.url,
            );
            // Resolve again against the selected profile so a second pasted URL
            // cannot silently send this project's credential to another locator.
            await resolveConnection(
              { ...options, connection: connection.name },
              rightTarget.url,
            );
            const context = await client.get(
              "/v1/studio/context",
              StudioContextResponseSchema,
            );
            const [leftDetail, rightDetail] = await Promise.all([
              client.get(
                `/v1/studio/runs/${encodeURIComponent(leftTarget.id)}`,
                StudioRunDetailResponseSchema,
              ),
              client.get(
                `/v1/studio/runs/${encodeURIComponent(rightTarget.id)}`,
                StudioRunDetailResponseSchema,
              ),
            ]);
            const catalogFor = async (
              detail: typeof leftDetail,
            ): Promise<CatalogDrift> => {
              try {
                const response = await client.get(
                  "/v1/studio/workflows",
                  StudioWorkflowsResponseSchema,
                  { range: "All time", workflow: detail.run.workflowId },
                );
                return compareCatalogRuntime(detail.run, response.workflows);
              } catch (error) {
                return {
                  status: "unavailable",
                  workflows: [],
                  reason:
                    error instanceof StudioReadError
                      ? error.code
                      : "catalog_comparison_failed",
                };
              }
            };
            const [leftCatalog, rightCatalog] = await Promise.all([
              catalogFor(leftDetail),
              catalogFor(rightDetail),
            ]);
            const side = (
              target: ReturnType<typeof parseStudioTarget>,
              detail: typeof leftDetail,
              catalog: CatalogDrift,
            ) => {
              const ordered = [...detail.events].sort(
                (a, b) =>
                  Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
                  Date.parse(a.receivedAt) - Date.parse(b.receivedAt) ||
                  a.id.localeCompare(b.id),
              );
              const timeline = buildStudioTimeline(
                ordered,
                detail.interrupts,
              ).slice(-options.eventLimit);
              return {
                target,
                run: detail.run,
                timeline,
                catalog,
                deploymentRefs: [
                  ...new Set(
                    ordered
                      .map((event) => event.deploymentRef)
                      .filter((value): value is string => Boolean(value)),
                  ),
                ],
                diagnostics: analyzeStudioDiagnostics(
                  ordered,
                  detail.run,
                  detail.interrupts,
                ),
                coverage: {
                  returnedTimelineSteps: timeline.length,
                  availableEvents: ordered.length,
                  contentIncluded: options.includeContent ?? false,
                },
              };
            };
            const left = side(leftTarget, leftDetail, leftCatalog);
            const right = side(rightTarget, rightDetail, rightCatalog);
            print(
              {
                schemaVersion: 1,
                connection: {
                  name: connection.name,
                  apiUrl: connection.apiUrl,
                  context,
                },
                left,
                right,
                comparison: compareRunAnalysis(left, right),
                note: "Comparison reports observed differences, not an automated root-cause verdict. Missing or omitted content cannot prove equivalence.",
              },
              options,
            );
          },
        );
    }
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
