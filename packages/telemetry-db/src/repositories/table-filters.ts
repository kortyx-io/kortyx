import {
  filterOperators,
  readStudioTableFilters,
  STUDIO_TABLE_FIELDS,
  STUDIO_TABLE_SORT_FIELDS,
  type StudioTableResource,
  type TableFilterDefinition,
  type TableFilters,
} from "@kortyx/telemetry-contracts";
import { and, eq, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { TelemetryDb } from "../client";
import { TelemetryValidationError } from "../errors";
import { studioInterrupts, studioRuns, studioSessions } from "../schema";

const tables = {
  runs: studioRuns,
  sessions: studioSessions,
  interrupts: studioInterrupts,
};
export const literalLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
export function parseStudioFilters(
  query: Record<string, string | undefined>,
  resource: StudioTableResource,
) {
  try {
    return readStudioTableFilters(query, resource);
  } catch {
    throw new TelemetryValidationError(
      "Invalid table filters. Check fields, operators and values.",
    );
  }
}
export function studioFilterExpression(
  resource: StudioTableResource,
  field: string,
): SQL {
  const table = tables[resource];
  if (!STUDIO_TABLE_FIELDS[resource].some((item) => item.key === field))
    throw new TelemetryValidationError("Unknown filter field.");
  if ((resource === "runs" || resource === "sessions") && field === "cost")
    return sql`to_jsonb(${resource === "runs" ? studioRuns.cost : studioSessions.cost})`;
  if (resource === "sessions" && field === "hasError")
    return sql`to_jsonb(${studioSessions.hasError})`;
  if (resource === "sessions" && field === "hasInterrupt")
    return sql`to_jsonb(${studioSessions.hasInterrupt})`;
  if (resource === "sessions" && field === "hasCheckpoint")
    return sql`to_jsonb(${studioSessions.hasCheckpoint})`;
  if (resource === "runs") {
    if (["toolName", "toolOutcome", "toolMode"].includes(field)) {
      const key =
        field === "toolName"
          ? "name"
          : field === "toolMode"
            ? "callingMode"
            : "outcome";
      return sql`coalesce((select jsonb_agg(distinct case when ${field}='toolOutcome' and event.type='tool.reused' then 'reused' else coalesce(event.payload ->> ${key}, case when ${field}='toolName' then event.payload ->> 'tool' end) end) from telemetry_events event where event.organization_id=${table.organizationId} and event.project_id=${table.projectId} and event.run_id=coalesce(${table.data}->>'parentRunId',${studioRuns.runId}) and event.type like 'tool.%' and (${table.data}->>'parentRunId' is null or (event.payload->>'invocationId'=${table.data}->>'invocationId' and event.payload->>'branchId'=${table.data}->>'branchId'))), '[]'::jsonb)`;
    }
    if (field === "execution")
      return sql`to_jsonb(case when ${table.data} ->> 'parentRunId' is null then 'root'::text else 'child'::text end)`;
    if (field === "versions")
      return sql`coalesce((select jsonb_agg(coalesce(ref ->> 'declaredVersion', 'unversioned')) from jsonb_array_elements(coalesce(${table.data} -> 'workflowRefs', '[]'::jsonb)) ref), jsonb_build_array(coalesce(${table.data} ->> 'declaredVersion', 'unversioned')))`;
    if (field === "models")
      return sql`coalesce(${table.data} -> 'models', jsonb_build_array(${table.data} ->> 'model'))`;
    if (field === "feedback")
      return sql`coalesce((select jsonb_agg(case when feedback.value = '1'::jsonb then 'positive' else 'negative' end) from telemetry_scores feedback where feedback.organization_id = ${table.organizationId} and feedback.project_id = ${table.projectId} and feedback.run_id = ${studioRuns.runId} and feedback.source = 'end-user' and feedback.name = 'user-feedback' and feedback.data_type = 'BOOLEAN'), '["unrated"]'::jsonb)`;
  }
  if (resource === "interrupts") {
    if (field === "age")
      return sql`to_jsonb(greatest(0, extract(epoch from (now() - ${studioInterrupts.createdAt})) / 60))`;
    if (field === "resolutionMs")
      return sql`to_jsonb(extract(epoch from ((${table.data} ->> 'resolvedAt')::timestamptz - ${studioInterrupts.createdAt})) * 1000)`;
    if (field === "status")
      return sql`to_jsonb(case when ${studioInterrupts.status} = 'pending' and ${studioInterrupts.expiresAt} <= now() then 'expired' else ${studioInterrupts.status} end)`;
    if (field === "resumeOutcome")
      return sql`to_jsonb(case when ${studioInterrupts.status} = 'pending' and ${studioInterrupts.expiresAt} <= now() then 'expired before resume' else ${table.data} ->> 'resumeOutcome' end)`;
  }
  return sql`${table.data} -> ${field}`;
}
/** A fixed allowlist supplies expressions; query text never becomes SQL syntax. */
export function studioSortExpression(
  resource: StudioTableResource,
  key?: string,
): SQL | undefined {
  const fields: Readonly<Record<string, string>> =
    STUDIO_TABLE_SORT_FIELDS[resource];
  const field = key && Object.hasOwn(fields, key) ? fields[key] : undefined;
  if (!field) return undefined;
  const kind = STUDIO_TABLE_FIELDS[resource].find(
    (item) => item.key === field,
  )?.kind;
  const text = sql`(${studioFilterExpression(resource, field)} #>> '{}')`;
  return kind === "number"
    ? sql`nullif(${text}, '')::numeric`
    : kind === "date"
      ? sql`nullif(${text}, '')::timestamptz`
      : sql`lower(${text})`;
}

export function jsonFilterCondition(
  filters: TableFilters,
  definitions: readonly TableFilterDefinition[],
  expression: (key: string) => SQL,
): SQL | undefined {
  const clauses = filters.rules.map((rule) => {
    const field = definitions.find((item) => item.key === rule.field);
    if (!field || !filterOperators(field.kind).includes(rule.operator))
      throw new TelemetryValidationError("Unsupported filter.");
    const value = expression(field.key);
    const values = sql`jsonb_array_elements(case when jsonb_typeof(${value}) = 'array' then ${value} else jsonb_build_array(${value}) end)`;
    const present = sql`exists (select 1 from ${values} as f(value) where f.value <> 'null'::jsonb and f.value #>> '{}' <> '')`;
    if (rule.operator === "present") return present;
    if (rule.operator === "missing") return sql`not (${present})`;
    const text = sql`f.value #>> '{}'`;
    const compared = rule.values.map((v) => {
      if (rule.operator === "contains" || rule.operator === "notContains")
        return sql`${text} ilike ${`%${literalLike(String(v))}%`}`;
      if (rule.operator === "is" || rule.operator === "isNot")
        return field.kind === "number"
          ? sql`(${text})::numeric = ${v}::numeric`
          : field.kind === "date"
            ? sql`(${text})::timestamptz = ${String(v)}::timestamptz`
            : sql`lower(${text}) = lower(${String(v)})`;
      const numeric =
        field.kind === "date"
          ? sql`(${text})::timestamptz`
          : sql`(${text})::numeric`;
      const bound =
        field.kind === "date"
          ? sql`${String(v)}::timestamptz`
          : sql`${v}::numeric`;
      switch (rule.operator) {
        case "gt":
          return sql`${numeric} > ${bound}`;
        case "gte":
          return sql`${numeric} >= ${bound}`;
        case "lt":
          return sql`${numeric} < ${bound}`;
        case "lte":
          return sql`${numeric} <= ${bound}`;
        case "between":
          return field.kind === "date"
            ? sql`${numeric} between ${String(rule.values[0])}::timestamptz and ${String(rule.values[1])}::timestamptz`
            : sql`${numeric} between ${rule.values[0]}::numeric and ${rule.values[1]}::numeric`;
      }
      return undefined;
    });
    const exists = sql`exists (select 1 from ${values} as f(value) where f.value <> 'null'::jsonb and f.value #>> '{}' <> '' and (${or(...compared)}))`;
    return rule.operator === "isNot" || rule.operator === "notContains"
      ? sql`(${present}) and not (${exists})`
      : exists;
  });
  if (!clauses.length) return undefined;
  return filters.match === "any" ? or(...clauses) : and(...clauses);
}
export function studioFiltersCondition(
  resource: StudioTableResource,
  filters: TableFilters,
) {
  return jsonFilterCondition(filters, STUDIO_TABLE_FIELDS[resource], (key) =>
    studioFilterExpression(resource, key),
  );
}
export async function listStudioFilterValues(
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    resource: StudioTableResource;
    field: string;
    search: string;
    environment?: string | undefined;
    after?: string | null;
    before?: string | null;
  },
) {
  const table = tables[input.resource];
  const expression = studioFilterExpression(input.resource, input.field);
  const time: AnyPgColumn =
    input.resource === "runs"
      ? studioRuns.startedAt
      : input.resource === "sessions"
        ? studioSessions.lastActivityAt
        : studioInterrupts.createdAt;
  const rows =
    await db.execute(sql`select distinct f.value #>> '{}' as value from ${table} cross join lateral jsonb_array_elements(case when jsonb_typeof(${expression}) = 'array' then ${expression} else jsonb_build_array(${expression}) end) as f(value)
    where ${eq(table.organizationId, input.organizationId)} and ${eq(table.projectId, input.projectId)}
    ${input.environment && input.environment !== "All environments" ? sql`and ${table.environment} = ${input.environment}` : sql``}
    ${input.after ? sql`and ${time} >= ${input.after}::timestamptz` : sql``}
    ${input.before ? sql`and ${time} <= ${input.before}::timestamptz` : sql``}
    and f.value <> 'null'::jsonb and length(f.value #>> '{}') between 1 and 512
    and f.value #>> '{}' ilike ${`%${literalLike(input.search)}%`} order by value limit 50`);
  return Array.from(rows).map((row) => String(row.value));
}
