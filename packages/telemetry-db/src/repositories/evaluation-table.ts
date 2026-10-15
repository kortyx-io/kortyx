import {
  EMPTY_TABLE_FILTERS,
  EVALUATION_TABLE_FILTER_FIELDS,
  matchesTableFilters,
  TableFiltersSchema,
  type TableFilterValue,
  validateTableFilters,
} from "@kortyx/telemetry-contracts";
import type { TelemetryDb } from "../client";
import { TelemetryValidationError } from "../errors";
import { listEvaluations } from "./evaluations";

type Summary = Awaited<ReturnType<typeof listEvaluations>>[number];
export function evaluationFilterValue(
  run: Summary,
  key: string,
): TableFilterValue {
  switch (key) {
    case "name":
      return run.name;
    case "id":
      return run.id;
    case "selection":
      return run.selection;
    case "suiteCount":
      return run.suiteCount;
    case "status":
      return run.status;
    case "completedSuites":
      return run.completedSuites;
    case "completedAttempts":
      return run.completedAttempts;
    case "totalAttempts":
      return run.totalAttempts;
    case "passed":
      return run.counts.passed;
    case "failed":
      return run.counts.failed;
    case "error":
      return run.counts.error;
    case "cancelled":
      return run.counts.cancelled;
    case "applicationId":
      return run.targetId;
    case "application":
      return run.targetName;
    case "environment":
      return run.environment;
    case "trigger":
      return run.metadata.source;
    case "commit":
      return run.metadata.commit;
    case "createdAt":
      return run.createdAt;
    case "cost":
      return (
        run.costs?.total.amount ??
        (run.costs?.total.costSummary?.amounts.length === 1
          ? run.costs.total.costSummary.amounts[0]?.amount
          : undefined)
      );
    case "duration":
      return run.startedAt &&
        (run.endedAt || ["queued", "running"].includes(run.status))
        ? Math.max(
            0,
            Date.parse(run.endedAt ?? new Date().toISOString()) -
              Date.parse(run.startedAt),
          )
        : undefined;
    default:
      return undefined;
  }
}
/** Computed summary fields include progress and costs. Scan bounded DB batches,
 * retain only the requested page, and never truncate the searchable history. */
export async function listEvaluationTable(
  db: TelemetryDb,
  scope: {
    organizationId: string;
    projectId: string;
    environment?: string | undefined;
  },
  query: Record<string, string | undefined>,
) {
  let filters = EMPTY_TABLE_FILTERS;
  try {
    filters = validateTableFilters(
      query.tableFilters
        ? TableFiltersSchema.parse(JSON.parse(query.tableFilters))
        : EMPTY_TABLE_FILTERS,
      EVALUATION_TABLE_FILTER_FIELDS,
    );
  } catch {
    throw new TelemetryValidationError("Invalid evaluation filters.");
  }
  if (query.status && query.status !== "all")
    filters = {
      ...filters,
      rules: [
        ...filters.rules,
        { field: "status", operator: "is" as const, values: [query.status] },
      ],
    };
  if (query.application && query.application !== "all")
    filters = {
      ...filters,
      rules: [
        ...filters.rules,
        {
          field: "applicationId",
          operator: "is" as const,
          values: [query.application],
        },
      ],
    };
  const cursor = Math.max(0, Number(query.cursor) || 0),
    size = Math.min(250, Math.max(1, Number(query.pageSize) || 20));
  const direction = query.dir === "asc" ? 1 : -1;
  const compare = (a: Summary, b: Summary) =>
    direction *
    ((query.sort === "name"
      ? a.name.localeCompare(b.name)
      : query.sort === "status"
        ? a.status.localeCompare(b.status)
        : a.createdAt.localeCompare(b.createdAt)) || a.id.localeCompare(b.id));
  let runs: Summary[] = [];
  let totalCount = 0;
  const values = new Set<string>();
  if (
    query.field &&
    !EVALUATION_TABLE_FILTER_FIELDS.some((field) => field.key === query.field)
  )
    throw new TelemetryValidationError("Unknown evaluation filter field.");
  for (let offset = 0; ; offset += 50) {
    const batch = await listEvaluations(db, scope, {
      scan: { offset, limit: 50 },
    });
    if (!batch.length) break;
    for (const run of batch) {
      if (query.field) {
        const value = evaluationFilterValue(run, query.field);
        if (
          value !== null &&
          value !== undefined &&
          String(value).length <= 512 &&
          String(value)
            .toLowerCase()
            .includes((query.search ?? "").toLowerCase())
        ) {
          values.add(String(value));
          if (values.size > 50) {
            const sorted = [...values].sort();
            values.clear();
            for (const v of sorted.slice(0, 50)) values.add(v);
          }
        }
      }
      if (
        !matchesTableFilters(
          filters,
          (key) => evaluationFilterValue(run, key),
          EVALUATION_TABLE_FILTER_FIELDS,
        )
      )
        continue;
      if (
        query.q &&
        !`${run.name} ${run.targetName} ${run.environment} ${run.metadata.source} ${run.metadata.commit ?? ""} ${run.id}`
          .toLowerCase()
          .includes(query.q.toLowerCase())
      )
        continue;
      totalCount++;
      runs.push(run);
    }
    runs.sort(compare);
    runs = runs.slice(0, cursor + size);
  }
  return {
    runs: runs.slice(cursor, cursor + size),
    totalCount,
    values: [...values].sort(),
  };
}
