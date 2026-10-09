import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  PromptContentSchema,
  promptHash,
  validatePromptContent,
} from "@kortyx/prompts";
import {
  PromptBundleSchema,
  type PromptMutation,
  PromptTransferRequestSchema,
} from "@kortyx/telemetry-contracts";
import { type Command, InvalidArgumentError } from "commander";
import { diffLines } from "diff";
import {
  type ConnectionOptions,
  defaultConnectionsHome,
  resolveConnection,
} from "../connections";
import { StudioEvalClient } from "./eval-client";
import { StudioPromptClient } from "./prompt-client";
import { defaultStudioHome } from "./state";

type Options = ConnectionOptions & {
  json?: boolean;
  file?: string;
  name?: string;
  category?: string;
  note?: string;
  version?: number;
  tag?: string;
  expectedRevision?: number;
  idempotencyKey?: string;
  from?: string;
  to?: string;
  history?: boolean;
  groups?: boolean;
  append?: boolean;
  rename?: string[];
  apply?: boolean;
  planFile?: string;
  bundleHash?: string;
  target?: string;
  suite?: string;
  case?: string[];
};
const positive = (value: string) => {
  if (!/^\d+$/.test(value) || Number(value) < 1)
    throw new InvalidArgumentError("Expected a positive integer.");
  return Number(value);
};
const collect = (value: string, previous: string[]) => [...previous, value];
async function contentFile(file: string) {
  const value = PromptContentSchema.parse(
    JSON.parse(await readFile(file, "utf8")),
  );
  validatePromptContent(value);
  return value;
}
export function registerStudioPromptCommands(
  studio: Command,
  log: (message: string) => void,
  request: typeof fetch = fetch,
) {
  const root = studio
    .command("prompts")
    .description("Read, version, test, promote and transfer Studio prompts.");
  const common = (command: Command) =>
    command
      .option("--connection <name>", "Named source/project connection.")
      .option(
        "--config-home <path>",
        "Connection profile directory.",
        defaultConnectionsHome(),
      )
      .option("--home <path>", "Local Studio state.", defaultStudioHome())
      .option("--api-url <url>", "Direct API URL; requires --api-key-env.")
      .option(
        "--api-key-env <name>",
        "Environment variable containing the key.",
      )
      .option("--json", "Machine-readable JSON output.");
  const print = (value: unknown, options: Options) =>
    log(
      JSON.stringify(
        { schemaVersion: 1, ...(value as Record<string, unknown>) },
        null,
        options.json ? 0 : 2,
      ),
    );
  const clientFor = async (options: Options) => {
    const connection = await resolveConnection(options);
    return {
      connection,
      client: new StudioPromptClient(
        connection.apiUrl,
        connection.apiKey,
        request,
        connection,
      ),
    };
  };
  common(
    root
      .command("list")
      .description("List the prompt library.")
      .option("--search <text>", "Search names and keys.")
      .option(
        "--cursor <cursor>",
        "Cursor returned by the previous library page.",
      )
      .option("--archived", "Include archived prompts."),
  ).action(
    async (
      options: Options & {
        search?: string;
        archived?: boolean;
        cursor?: string;
      },
    ) => {
      const { client } = await clientFor(options);
      print(
        await client.list({
          ...(options.search ? { search: options.search } : {}),
          ...(options.cursor ? { cursor: options.cursor } : {}),
          ...(options.archived ? { archived: "true" } : {}),
        }),
        options,
      );
    },
  );
  common(
    root
      .command("get <key>")
      .description("Read templates, configuration, versions and evidence.")
      .option("--version <number>", "Read one immutable version.", positive)
      .option("--file <path>", "Write executable content JSON for editing."),
  ).action(async (key: string, options: Options) => {
    const { client } = await clientFor(options),
      detail = await client.get(
        key,
        options.version ? { version: options.version } : {},
      ),
      version = detail.versions.find(
        (item) =>
          item.version === (options.version ?? detail.asset.latestVersion),
      );
    if (!version) throw new Error("Version not found.");
    if (options.file)
      await writeFile(
        options.file,
        `${JSON.stringify(version.content, null, 2)}\n`,
        { mode: 0o600 },
      );
    print(options.version ? { version } : detail, options);
  });
  common(
    root
      .command("versions <key>")
      .description("List immutable version identities and change notes.")
      .option(
        "--cursor <cursor>",
        "Cursor returned by the previous version page.",
      ),
  ).action(async (key: string, options: Options & { cursor?: string }) => {
    const { client } = await clientFor(options);
    const detail = await client.get(
      key,
      options.cursor ? { versionsCursor: options.cursor } : {},
    );
    print(
      {
        nextCursor: detail.versionsNextCursor ?? null,
        versions: detail.versions.map(({ content: _, ...version }) => version),
      },
      options,
    );
  });
  common(
    root
      .command("diff <key> <before> <after>")
      .description("Compare messages, configuration and contracts."),
  ).action(
    async (key: string, before: string, after: string, options: Options) => {
      const { client } = await clientFor(options),
        results = await Promise.all([
          client.get(key, { version: positive(before) }),
          client.get(key, { version: positive(after) }),
        ]),
        a = results[0].versions.find(
          (version) => version.version === positive(before),
        ),
        b = results[1].versions.find(
          (version) => version.version === positive(after),
        );
      if (!a || !b) throw new Error("Version not found.");
      print(
        {
          before: a.version,
          after: b.version,
          changes: diffLines(
            JSON.stringify(a.content, null, 2),
            JSON.stringify(b.content, null, 2),
          ),
        },
        options,
      );
    },
  );
  common(
    root
      .command("validate <file>")
      .description(
        "Validate template inputs, configuration and format offline.",
      ),
  ).action(async (file: string, options: Options) =>
    print(
      { valid: true, hash: await promptHash(await contentFile(file)) },
      options,
    ),
  );
  common(
    root
      .command("create <key>")
      .requiredOption("--file <path>", "Executable prompt JSON.")
      .requiredOption("--name <text>", "Display name.")
      .requiredOption("--note <text>", "Initial version note.")
      .option("--category <uuid>", "Category; omit for Root.")
      .option(
        "--idempotency-key <uuid>",
        "Stable key to safely retry creation.",
      ),
  ).action(async (key: string, options: Options) => {
    const { client } = await clientFor(options);
    print(
      await client.mutate({
        action: "create",
        key,
        name: options.name!,
        categoryId: options.category ?? null,
        content: await contentFile(options.file!),
        note: options.note!,
        idempotencyKey: options.idempotencyKey ?? randomUUID(),
      }),
      options,
    );
  });
  common(
    root
      .command("update <key>")
      .alias("edit")
      .description("Save a new immutable version from a reviewed file.")
      .requiredOption("--file <path>", "Executable prompt JSON.")
      .requiredOption("--note <text>", "Change note.")
      .requiredOption(
        "--base-version <number>",
        "Reviewed current head.",
        positive,
      )
      .requiredOption(
        "--expected-hash <hash>",
        "Reviewed candidate content hash from validate.",
      )
      .option(
        "--idempotency-key <uuid>",
        "Stable key to safely retry this save.",
      ),
  ).action(
    async (
      key: string,
      options: Options & { baseVersion: number; expectedHash: string },
    ) => {
      const { client } = await clientFor(options),
        detail = await client.get(key);
      print(
        await client.mutate({
          action: "save",
          id: detail.asset.id,
          content: await contentFile(options.file!),
          note: options.note!,
          baseVersion: options.baseVersion,
          expectedHash: options.expectedHash,
          idempotencyKey: options.idempotencyKey ?? randomUUID(),
        }),
        options,
      );
    },
  );
  common(
    root
      .command("action <file>")
      .description(
        "Apply a validated category, group, draft, review, policy or asset mutation JSON.",
      ),
  ).action(async (file: string, options: Options) => {
    const { client } = await clientFor(options);
    print(
      await client.mutate(
        JSON.parse(await readFile(file, "utf8")) as PromptMutation,
      ),
      options,
    );
  });
  for (const remove of [false, true])
    common(
      root
        .command(`${remove ? "untag" : "tag"} <key> <tag>`)
        .description(
          remove
            ? "Remove a manually assigned tag; live is reserved."
            : "Assign a tag to an exact version without promoting it; live is reserved.",
        )
        .option(
          "--version <number>",
          "Exact version (required when assigning).",
          positive,
        )
        .requiredOption(
          "--expected-revision <number>",
          "Current tag revision; 0 for a new tag.",
          Number,
        ),
    ).action(async (key: string, tag: string, options: Options) => {
      if (!remove && !options.version)
        throw new Error("--version is required when assigning a tag.");
      const { client } = await clientFor(options);
      const detail = await client.get(key);
      print(
        await client.mutate(
          remove
            ? {
                action: "tag-remove",
                id: detail.asset.id,
                tag,
                expectedRevision: options.expectedRevision!,
              }
            : {
                action: "tag-set",
                id: detail.asset.id,
                tag,
                version: options.version!,
                expectedRevision: options.expectedRevision!,
              },
        ),
        options,
      );
    });
  for (const rollback of [false, true])
    common(
      root
        .command(`${rollback ? "rollback" : "promote"} <key>`)
        .description(
          "Make an exact version live after promotion policy checks.",
        )
        .requiredOption(
          "--version <number>",
          "Exact immutable version.",
          positive,
        )
        .requiredOption(
          "--expected-revision <number>",
          "Current live tag revision; 0 if not yet promoted.",
          Number,
        )
        .option("--exception-reason <text>", "Audited policy exception."),
    ).action(
      async (key: string, options: Options & { exceptionReason?: string }) => {
        const { client } = await clientFor(options),
          detail = await client.get(key);
        print(
          await client.mutate({
            action: "promote",
            id: detail.asset.id,
            version: options.version!,
            expectedRevision: options.expectedRevision!,
            rollback,
            ...(options.exceptionReason
              ? { exceptionReason: options.exceptionReason }
              : {}),
          }),
          options,
        );
      },
    );
  for (const archived of [true, false])
    common(
      root
        .command(`${archived ? "archive" : "restore"} <key>`)
        .description(
          `${archived ? "Archive an unassigned" : "Restore an archived"} prompt.`,
        )
        .requiredOption(
          "--expected-revision <number>",
          "Reviewed asset revision.",
          positive,
        ),
    ).action(async (key: string, options: Options) => {
      const { client } = await clientFor(options),
        detail = await client.get(key);
      print(
        await client.mutate({
          action: "update",
          id: detail.asset.id,
          archived,
          expectedRevision: options.expectedRevision!,
        }),
        options,
      );
    });
  common(
    root
      .command("test <key>")
      .description(
        "Run a suite or selected tests against one candidate version.",
      )
      .requiredOption("--version <number>", "Candidate version.", positive)
      .requiredOption("--target <id>", "Registered application target.")
      .requiredOption("--suite <id>", "Suite ID.")
      .option(
        "--case <id>",
        "Choose individual tests (repeatable).",
        collect,
        [],
      ),
  ).action(async (key: string, options: Options) => {
    const { connection, client } = await clientFor(options),
      detail = await client.get(key),
      evals = new StudioEvalClient(
        connection.apiUrl,
        connection.apiKey,
        request,
        connection,
      ),
      targets = await evals.targets(),
      target = targets.targets.find((item) => item.id === options.target),
      revision = target?.revisions[options.suite!];
    if (!revision) throw new Error("Application or suite not found.");
    print(
      await evals.start({
        targetId: options.target!,
        suiteId: options.suite!,
        suiteRevision: revision,
        judge: "app",
        promptSelection: {
          type: "single",
          id: detail.asset.id,
          version: options.version!,
        },
        ...(options.case?.length ? { caseIds: options.case } : {}),
      }),
      options,
    );
  });
  common(
    root
      .command("export <key...>")
      .description(
        "Export exact versions and dependencies; no live assignments or credentials.",
      )
      .option(
        "--version <number>",
        "Export one exact version (one key only).",
        positive,
      )
      .option("--history", "Include complete immutable histories.")
      .option("--groups", "Include groups fully covered by the bundle.")
      .option("--file <path>", "Save the portable bundle."),
  ).action(async (keys: string[], options: Options) => {
    if (options.version && (keys.length !== 1 || options.history))
      throw new Error("--version requires exactly one key without --history.");
    const { client } = await clientFor(options),
      bundle = await client.export({
        keys,
        ...(options.version
          ? { versions: { [keys[0]!]: options.version } }
          : {}),
        history: options.history ?? false,
        groups: options.groups ?? false,
      });
    if (options.file)
      await writeFile(options.file, `${JSON.stringify(bundle, null, 2)}\n`, {
        mode: 0o600,
      });
    print(bundle, options);
  });
  const transferOptions = (command: Command) =>
    common(
      command
        .option("--append", "Explicitly append unrelated same-key content.")
        .option(
          "--rename <source=destination>",
          "Rename a key (repeatable).",
          collect,
          [],
        )
        .option("--groups", "Import group selections.")
        .option("--plan-file <path>", "Persist reviewed plan for retry/apply.")
        .option(
          "--apply",
          "Apply the reviewed plan; keeps all live assignments.",
          false,
        ),
    );
  const importBundle = async (
    bundle: unknown,
    options: Options,
    connectionName?: string,
  ) => {
    const { client } = await clientFor({
      ...options,
      ...(connectionName
        ? {
            connection: connectionName,
            apiUrl: undefined,
            apiKeyEnv: undefined,
          }
        : {}),
    });
    const rename: Record<string, string> = {};
    for (const item of options.rename ?? []) {
      const [source, destination, extra] = item.split("=");
      if (!source || !destination || extra)
        throw new Error("Use --rename source=destination.");
      rename[source] = destination;
    }
    const plan = await client.plan(
      PromptTransferRequestSchema.parse({
        bundle: PromptBundleSchema.parse(bundle),
        conflicts: options.append ? "append" : "error",
        rename,
        groups: options.groups ?? false,
      }),
    );
    if (options.planFile)
      await writeFile(options.planFile, `${JSON.stringify(plan, null, 2)}\n`, {
        mode: 0o600,
      });
    print(
      options.apply ? await client.apply(plan.id, plan.bundleHash) : plan,
      options,
    );
  };
  transferOptions(
    root
      .command("import <file>")
      .description("Plan or apply a portable bundle into this connection."),
  ).action(async (file: string, options: Options) =>
    importBundle(JSON.parse(await readFile(file, "utf8")), options),
  );
  transferOptions(
    root
      .command("copy <key...>")
      .description(
        "Copy prompts between independently authenticated deployments or projects.",
      )
      .requiredOption("--from <connection>", "Named source connection.")
      .requiredOption("--to <connection>", "Named destination connection.")
      .option(
        "--version <number>",
        "Copy one exact version (one key only).",
        positive,
      )
      .option("--history", "Include immutable histories."),
  ).action(async (keys: string[], options: Options) => {
    const { client } = await clientFor({
      ...options,
      connection: options.from,
      apiUrl: undefined,
      apiKeyEnv: undefined,
    });
    if (options.version && (keys.length !== 1 || options.history))
      throw new Error("--version requires exactly one key without --history.");
    const bundle = await client.export({
      keys,
      ...(options.version ? { versions: { [keys[0]!]: options.version } } : {}),
      history: options.history ?? false,
      groups: options.groups ?? false,
    });
    await importBundle(bundle, options, options.to);
  });
  common(
    root
      .command("apply <plan-file>")
      .description(
        "Apply or retry a saved plan on its destination connection.",
      ),
  ).action(async (file: string, options: Options) => {
    const plan = JSON.parse(await readFile(file, "utf8")) as {
        id: string;
        bundleHash: string;
      },
      { client } = await clientFor(options);
    print(await client.apply(plan.id, plan.bundleHash), options);
  });
}
