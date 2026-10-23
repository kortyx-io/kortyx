import { writeFile } from "node:fs/promises";
import { type Command, InvalidArgumentError } from "commander";
import { type ConnectionOptions, resolveConnection } from "../connections";
import { parseEvalRunTarget, StudioEvalClient } from "./eval-client";
import { StudioReadError } from "./read-client";
import { formatReadOutput, sanitizeStudioData } from "./read-output";

type Options = ConnectionOptions & {
  json?: boolean;
  includeContent?: boolean;
  suite?: string;
  case?: string;
  repetition?: string | number;
  status?: string;
  phase?: string;
  cursor?: string | number;
  limit?: string | number;
  turn?: string | number;
  section?: string;
  contentCursor?: string | number;
  contentLimit?: string | number;
  event?: string;
  output?: string;
  environment?: string;
};

export async function readEvalInspection(
  input: string,
  options: Options,
  request: typeof fetch = fetch,
  view = "overview",
) {
  const target = parseEvalRunTarget(input);
  const connection = await resolveConnection(options, target.url);
  const client = new StudioEvalClient(
    connection.apiUrl,
    connection.apiKey,
    request,
    {
      environment: options.environment ?? connection.environment,
      projectId: connection.projectId,
    },
  );
  const query: Record<string, string> = { view };
  for (const [key, value] of Object.entries({
    suite: options.suite,
    caseId: options.case,
    repetition: options.repetition,
    status: options.status,
    phase: options.phase,
    cursor: options.cursor,
    limit: options.limit,
    turn: options.turn,
    section: options.section,
    contentCursor: options.contentCursor,
    contentLimit: options.contentLimit,
    event: options.event,
  }))
    if (value !== undefined) query[key] = String(value);
  const result =
    view === "comparison"
      ? {
          inspectionVersion: 1 as const,
          id: target.id,
          view: "overview" as const,
          data: (await client.comparison(target.id)).run,
          page: { available: 1, returned: 1, omitted: 0, nextCursor: null },
          expand: [] as Array<{
            command: string;
            args: Record<string, string>;
          }>,
        }
      : await client.inspection(target.id, query);
  return {
    connection: connection.name,
    ...result,
    expand: result.expand.map((item) => {
      const args = {
        ...item.args,
        ...(options.connection ? { connection: options.connection } : {}),
        ...(options.configHome ? { "config-home": options.configHome } : {}),
        ...(options.environment ? { environment: options.environment } : {}),
        ...(options.home ? { home: options.home } : {}),
        ...(options.apiUrl ? { "api-url": options.apiUrl } : {}),
        ...(options.apiKeyEnv ? { "api-key-env": options.apiKeyEnv } : {}),
      };
      return {
        ...item,
        args,
        command: `${item.command}${item.command.includes(" evidence ") ? " --include-content" : ""} ${Object.entries(
          args,
        )
          .map(([key, value]) => `--${key} '${value.replace(/'/g, "'\\''")}'`)
          .join(" ")}`,
      };
    }),
  };
}

export function registerEvalInspectionCommands(
  evals: Command,
  common: (command: Command) => Command,
  log: (message: string) => void,
  request: typeof fetch,
) {
  for (const [name, view] of [
    ["overview", "overview"],
    ["attempts", "attempts"],
    ["turn", "turn"],
    ["evidence", "evidence"],
  ] as const) {
    const command = common(
      evals
        .command(`${name} <id-or-url>`)
        .description(
          `Read bounded evaluation ${name}; never executes workflows.`,
        ),
    )
      .option(
        "--environment <name>",
        "Read environment (defaults to the selected connection).",
      )
      .option("--suite <id>", "Suite ID or saved suite run UUID.")
      .option("--case <id>", "Case ID.")
      .option("--repetition <number>", "Attempt repetition (1–20).")
      .option("--status <status>", "Filter attempt status before transmission.")
      .option("--phase <phase>", "Filter attempt execution/failure phase.")
      .option("--cursor <offset>", "Continuation cursor.")
      .option("--limit <count>", "Maximum returned attempts/events (1–100).")
      .option("--turn <index>", "Zero-based saved turn index.")
      .option(
        "--section <name>",
        "input, expectation, observation, criteria, verification, tools, output, interrupt, model, diagnostic, or context.",
      )
      .option("--event <uuid>", "Expand one captured model/runtime event.")
      .option(
        "--content-cursor <offset>",
        "Continue a selected evidence fragment.",
      )
      .option(
        "--content-limit <characters>",
        "Maximum evidence characters (1–32768).",
      )
      .option(
        "--output <path>",
        "Export this bounded page to a new private file (0600); never overwrites.",
      );
    command.action(async (input: string, options: Options) => {
      if (view === "evidence" && !options.includeContent)
        throw new InvalidArgumentError(
          "Evidence requires --include-content. Use turn for a content-free overview.",
        );
      const value = await readEvalInspection(input, options, request, view);
      const safe = sanitizeStudioData(
        { schemaVersion: 1, ...value },
        options.includeContent ?? false,
      );
      if (options.output) {
        await writeFile(options.output, `${JSON.stringify(safe)}\n`, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
        log(
          formatReadOutput(
            { file: options.output, page: value.page },
            options.json ?? false,
          ),
        );
      } else log(formatReadOutput(safe, options.json ?? false));
    });
  }
  common(
    evals
      .command("compare <left> <right>")
      .description(
        "Compare bounded evaluation metadata and report the first changed fields.",
      ),
  ).action(async (left: string, right: string, options: Options) => {
    const [a, b] = await Promise.all([
      readEvalInspection(left, options, request, "comparison"),
      readEvalInspection(right, options, request, "comparison"),
    ]);
    const firstDifferences: Array<{
      field: string;
      left: unknown;
      right: unknown;
    }> = [];
    const walk = (x: unknown, y: unknown, path: string) => {
      if (
        firstDifferences.length >= 20 ||
        JSON.stringify(x) === JSON.stringify(y)
      )
        return;
      if (
        x &&
        y &&
        typeof x === "object" &&
        typeof y === "object" &&
        !Array.isArray(x) &&
        !Array.isArray(y)
      ) {
        const xx = x as Record<string, unknown>,
          yy = y as Record<string, unknown>;
        for (const key of new Set([...Object.keys(xx), ...Object.keys(yy)]))
          walk(xx[key], yy[key], path ? `${path}.${key}` : key);
      } else
        firstDifferences.push({
          field: path,
          left: x ?? null,
          right: y ?? null,
        });
    };
    // Revision/deployment/judge/settings facts precede timing/count changes.
    for (const key of [
      "metadata",
      "judge",
      "resolvedSettings",
      "suites",
      "counts",
    ])
      walk(
        (a.data as Record<string, unknown> | null)?.[key],
        (b.data as Record<string, unknown> | null)?.[key],
        key,
      );
    log(
      formatReadOutput(
        sanitizeStudioData(
          {
            left: a.id,
            right: b.id,
            firstDifferences,
            expand: [...a.expand, ...b.expand],
          },
          options.includeContent ?? false,
        ),
        options.json ?? false,
      ),
    );
  });
}

export async function evalReadCompatibility(client: StudioEvalClient) {
  try {
    return { status: "supported", ...(await client.inspectionCapabilities()) };
  } catch (error) {
    if (!(error instanceof StudioReadError) || error.status !== 404)
      throw error;
    return {
      status: "unsupported",
      reason:
        "Server lacks bounded evaluation inspection. Upgrade Studio API and CLI together.",
    };
  }
}
