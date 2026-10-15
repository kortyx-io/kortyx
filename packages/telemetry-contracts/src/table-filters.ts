import { z } from "zod";

export const TableFilterRuleSchema = z
  .object({
    field: z.string().min(1).max(80),
    operator: z.enum([
      "contains",
      "notContains",
      "is",
      "isNot",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
      "present",
      "missing",
    ]),
    values: z
      .array(
        z.union([z.string().min(1).max(512), z.number().finite(), z.boolean()]),
      )
      .max(30),
  })
  .strict();
export const TableFiltersSchema = z
  .object({
    match: z.enum(["all", "any"]),
    rules: z.array(TableFilterRuleSchema).max(32),
  })
  .strict()
  .refine(
    (value) => JSON.stringify(value).length <= 32768,
    "Filters must fit within 32 KiB.",
  );
export type TableFilterRule = z.infer<typeof TableFilterRuleSchema>;
export type TableFilters = z.infer<typeof TableFiltersSchema>;
export type TableFilterKind = "text" | "enum" | "number" | "date" | "boolean";
export type TableFilterValue = string | number | boolean | null | undefined;
export type TableFilterDefinition = {
  key: string;
  label: string;
  kind: TableFilterKind;
  options?: readonly string[];
  unit?: string;
};
export const EMPTY_TABLE_FILTERS: TableFilters = { match: "all", rules: [] };
export const filterOperators = (
  kind: TableFilterKind,
): TableFilterRule["operator"][] => [
  ...(kind === "text" ? (["contains", "notContains"] as const) : []),
  "is",
  "isNot",
  ...(kind === "number" || kind === "date"
    ? (["gt", "gte", "lt", "lte", "between"] as const)
    : []),
  "present",
  "missing",
];
export function validateTableFilters(
  filters: TableFilters,
  fields: readonly TableFilterDefinition[],
) {
  const parsed = TableFiltersSchema.safeParse(filters);
  if (!parsed.success) throw new Error("Enter valid values for every filter.");
  for (const rule of filters.rules) {
    const field = fields.find((item) => item.key === rule.field);
    if (!field || !filterOperators(field.kind).includes(rule.operator))
      throw new Error("Unsupported filter field or operator.");
    const noValue = rule.operator === "present" || rule.operator === "missing";
    if (
      noValue
        ? rule.values.length !== 0
        : rule.operator === "between"
          ? rule.values.length !== 2
          : !rule.values.length
    )
      throw new Error("Invalid number of filter values.");
    for (const value of rule.values) {
      if (field.kind === "number" && typeof value !== "number")
        throw new Error("Numeric filters require numbers.");
      if (field.kind === "boolean" && typeof value !== "boolean")
        throw new Error("Boolean filters require true or false.");
      if (
        (field.kind === "text" ||
          field.kind === "enum" ||
          field.kind === "date") &&
        typeof value !== "string"
      )
        throw new Error("Text filters require strings.");
      if (
        field.kind === "date" &&
        (typeof value !== "string" ||
          !Number.isFinite(Date.parse(value)) ||
          !/(Z|[+-]\d{2}:\d{2})$/.test(value))
      )
        throw new Error("Date filters require ISO timestamps with an offset.");
    }
    if (
      rule.operator === "between" &&
      (field.kind === "date"
        ? Date.parse(String(rule.values[0])) >
          Date.parse(String(rule.values[1]))
        : Number(rule.values[0]) > Number(rule.values[1]))
    )
      throw new Error("Filter minimum must not exceed maximum.");
  }
  return filters;
}
export function matchesTableRule(
  value: TableFilterValue | readonly TableFilterValue[],
  rule: TableFilterRule,
  kind?: TableFilterKind,
): boolean {
  const values = (Array.isArray(value) ? value : [value]).filter(
    (item) => item !== null && item !== undefined && item !== "",
  );
  if (rule.operator === "present") return values.length > 0;
  if (rule.operator === "missing") return values.length === 0;
  if (!values.length) return false;
  const equal = (a: TableFilterValue, b: TableFilterValue) =>
    typeof a === "string" && typeof b === "string"
      ? kind === "date"
        ? Date.parse(a) === Date.parse(b)
        : a.toLowerCase() === b.toLowerCase()
      : a === b;
  const contains = () =>
    values.some((a) =>
      rule.values.some((b) =>
        String(a).toLowerCase().includes(String(b).toLowerCase()),
      ),
    );
  if (rule.operator === "contains") return contains();
  if (rule.operator === "notContains") return !contains();
  if (rule.operator === "is")
    return values.some((a) => rule.values.some((b) => equal(a, b)));
  if (rule.operator === "isNot")
    return !values.some((a) => rule.values.some((b) => equal(a, b)));
  return values.some((a) => {
    const comparable =
      typeof a === "string" && /T.*(Z|[+-]\d{2}:\d{2})$/.test(a)
        ? Date.parse(a)
        : Number(a);
    const bounds = rule.values.map((b) =>
      typeof b === "string" ? Date.parse(b) : Number(b),
    );
    switch (rule.operator) {
      case "gt":
        return comparable > bounds[0]!;
      case "gte":
        return comparable >= bounds[0]!;
      case "lt":
        return comparable < bounds[0]!;
      case "lte":
        return comparable <= bounds[0]!;
      case "between":
        return comparable >= bounds[0]! && comparable <= bounds[1]!;
      default:
        return false;
    }
  });
}
export function matchesTableFilters(
  filters: TableFilters,
  read: (key: string) => TableFilterValue | readonly TableFilterValue[],
  fields?: readonly TableFilterDefinition[],
) {
  if (!filters.rules.length) return true;
  const match = (rule: TableFilterRule) =>
    matchesTableRule(
      read(rule.field),
      rule,
      fields?.find((f) => f.key === rule.field)?.kind,
    );
  return filters.match === "any"
    ? filters.rules.some(match)
    : filters.rules.every(match);
}

const field = (
  key: string,
  label: string,
  kind: TableFilterKind = "text",
  unit?: string,
): TableFilterDefinition => ({ key, label, kind, ...(unit ? { unit } : {}) });
const identity = [field("userId", "User ID"), field("tenantId", "Tenant ID")];
const metrics = [
  field("durationMs", "Duration", "number", "ms"),
  field("tokens", "Tokens", "number"),
  field("cost", "Cost", "number", "currency units"),
  field("currency", "Currency", "enum"),
];
export const STUDIO_TABLE_FIELDS = {
  runs: [
    field("id", "Run ID"),
    field("execution", "Execution", "enum"),
    field("parentRunId", "Parent run ID"),
    field("callId", "Call ID"),
    field("status", "Status", "enum"),
    field("startedAt", "Started", "date"),
    field("feedback", "Feedback", "enum"),
    field("workflowIds", "Workflow"),
    field("versions", "Version"),
    field("path", "Path"),
    field("sessionId", "Session ID"),
    field("provider", "Provider", "enum"),
    field("models", "Model"),
    ...metrics,
    field("result", "Result"),
    field("hasTool", "Has tool call", "boolean"),
    field("toolName", "Tool name"),
    field("toolOutcome", "Tool outcome", "enum"),
    field("toolMode", "Called by", "enum"),
    field("transitionIds", "Workflow transition"),
  ],
  sessions: [
    field("id", "Session ID"),
    field("status", "Status", "enum"),
    field("lastActivityAt", "Last activity", "date"),
    ...identity,
    field("workflowIds", "Workflow"),
    field("activeVersion", "Version"),
    field("runs", "Runs", "number"),
    field("succeeded", "Successful runs", "number"),
    field("failed", "Failed runs", "number"),
    field("interrupted", "Interrupted runs", "number"),
    field("checkpoints", "Checkpoints", "number"),
    field("hasFork", "Has branch", "boolean"),
    ...metrics,
    field("latestResult", "Latest result"),
    field("latestError", "Latest error"),
    field("pendingInterruptId", "Pending interrupt"),
    field("hasError", "Has error", "boolean"),
    field("hasInterrupt", "Has interrupt", "boolean"),
    field("hasCheckpoint", "Has checkpoint", "boolean"),
    field("providers", "Provider", "enum"),
    field("models", "Model"),
    field("tags", "Tags"),
  ],
  interrupts: [
    field("id", "Interrupt ID"),
    field("status", "Status", "enum"),
    field("createdAt", "Created", "date"),
    field("age", "Age", "number", "minutes"),
    field("resolutionMs", "Resolution time", "number", "ms"),
    field("type", "Type", "enum"),
    field("question", "Request"),
    field("contract", "Contract"),
    field("schemaId", "Schema ID"),
    field("workflowId", "Workflow"),
    field("nodeId", "Node"),
    field("sessionId", "Session ID"),
    ...identity,
    field("response", "Response"),
    field("resolvedBy", "Resolved by"),
    field("resumeOutcome", "Resume outcome", "enum"),
    field("resumeError", "Resume error"),
    field("runId", "Run ID"),
  ],
} satisfies Record<string, TableFilterDefinition[]>;
export type StudioTableResource = keyof typeof STUDIO_TABLE_FIELDS;

/** Existing links/views remain valid; new edits replace these aliases atomically. */
export const LEGACY_TABLE_FILTERS = {
  toolName: ["toolName", "contains"],
  toolOutcome: ["toolOutcome", "is"],
  toolMode: ["toolMode", "is"],
  error: ["hasError", "is"],
  interrupt: ["hasInterrupt", "is"],
  checkpoint: ["hasCheckpoint", "is"],
  fork: ["hasFork", "is"],
  transition: ["transitionIds", "is"],
  status: ["status", "is"],
  provider: ["provider", "is"],
  workflow: ["workflowIds", "is"],
  version: ["versions", "is"],
  path: ["path", "is"],
  session: ["sessionId", "contains"],
  model: ["models", "contains"],
  result: ["result", "contains"],
  feedback: ["feedback", "is"],
  tool: ["hasTool", "is"],
  user: ["userId", "contains"],
  tenant: ["tenantId", "contains"],
  tags: ["tags", "contains"],
  node: ["nodeId", "contains"],
  resolver: ["resolvedBy", "contains"],
  outcome: ["resumeOutcome", "is"],
  type: ["type", "is"],
  minCost: ["cost", "gte"],
  maxCost: ["cost", "lte"],
  minTokens: ["tokens", "gte"],
  maxTokens: ["tokens", "lte"],
  minDuration: ["durationMs", "gte"],
  maxDuration: ["durationMs", "lte"],
  minAge: ["age", "gte"],
  maxAge: ["age", "lte"],
} as const;
export function readStudioTableFilters(
  query: Record<string, string | undefined>,
  resource: StudioTableResource,
): TableFilters {
  const fields: readonly TableFilterDefinition[] =
    STUDIO_TABLE_FIELDS[resource];
  const filters = query.tableFilters
    ? TableFiltersSchema.parse(JSON.parse(query.tableFilters))
    : { match: "all" as const, rules: [] as TableFilterRule[] };
  const rules = [...filters.rules];
  for (const [alias, [original, operator]] of Object.entries(
    LEGACY_TABLE_FILTERS,
  )) {
    const raw = query[alias];
    if (!raw) continue;
    if (resource === "interrupts" && alias === "error") {
      if (raw === "true" || raw === "1")
        rules.push({ field: "resumeError", operator: "present", values: [] });
      continue;
    }
    const key =
      resource === "sessions" && alias === "provider"
        ? "providers"
        : resource === "sessions" && alias === "version"
          ? "activeVersion"
          : resource === "interrupts" && alias === "workflow"
            ? "workflowId"
            : original;
    const definition = fields.find((f) => f.key === key);
    if (!definition) continue;
    const values =
      definition.kind === "number"
        ? [Number(raw) * (alias.endsWith("Duration") ? 1000 : 1)]
        : definition.kind === "boolean"
          ? [raw === "true" || raw === "1"]
          : operator === "is"
            ? raw.split(",").filter(Boolean)
            : [raw];
    rules.push({
      field: key,
      operator:
        resource === "interrupts" && alias === "workflow"
          ? "contains"
          : operator,
      values,
    });
  }
  return validateTableFilters(
    TableFiltersSchema.parse({ ...filters, rules }),
    fields,
  );
}

export const PROMPT_TABLE_FILTER_FIELDS: TableFilterDefinition[] = [
  field("name", "Prompt"),
  field("key", "Key"),
  field("category", "Category"),
  field("categoryId", "Category ID"),
  field("live", "Is live", "boolean"),
  field("liveVersion", "Live version", "number"),
  field("latestVersion", "Newest version", "number"),
  field("updatedAt", "Updated", "date"),
];
export const EVALUATION_TABLE_FILTER_FIELDS: TableFilterDefinition[] = [
  field("name", "Evaluation run"),
  field("id", "Evaluation ID"),
  field("selection", "Suite selection", "enum"),
  field("suiteCount", "Suites", "number"),
  field("status", "Status", "enum"),
  field("completedSuites", "Completed suites", "number"),
  field("completedAttempts", "Graded attempts", "number"),
  field("totalAttempts", "Total attempts", "number"),
  field("passed", "Passed", "number"),
  field("failed", "Failed", "number"),
  field("error", "Errors", "number"),
  field("cancelled", "Cancelled", "number"),
  field("applicationId", "Application ID"),
  field("application", "Application"),
  field("environment", "Environment", "enum"),
  field("trigger", "Trigger", "enum"),
  field("commit", "Commit"),
  field("createdAt", "Created", "date"),
  field("cost", "Cost", "number"),
  field("duration", "Duration (ms)", "number"),
];
