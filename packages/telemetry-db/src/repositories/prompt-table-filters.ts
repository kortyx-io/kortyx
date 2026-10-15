import {
  PROMPT_TABLE_FILTER_FIELDS,
  type TableFilters,
  TableFiltersSchema,
  validateTableFilters,
} from "@kortyx/telemetry-contracts";
import { type SQL, sql } from "drizzle-orm";
import type { TelemetryDb } from "../client";
import { TelemetryValidationError } from "../errors";
import { promptAssets } from "../schema";
import { jsonFilterCondition, literalLike } from "./table-filters";
export function promptFilterExpression(key: string): SQL {
  const live = sql`select assignment.version from prompt_assignments assignment where assignment.organization_id=${promptAssets.organizationId} and assignment.project_id=${promptAssets.projectId} and assignment.prompt_id=${promptAssets.id} and assignment.tag='live'`;
  if (key === "live") return sql`to_jsonb(exists (${live}))`;
  if (key === "liveVersion") return sql`to_jsonb((${live}))`;
  if (key === "category")
    return sql`to_jsonb(coalesce((with recursive ancestors as (select id,name,parent_id,1 as depth from prompt_categories where id=${promptAssets.categoryId} and organization_id=${promptAssets.organizationId} and project_id=${promptAssets.projectId} union all select c.id,c.name,c.parent_id,a.depth+1 from prompt_categories c join ancestors a on c.id=a.parent_id where c.organization_id=${promptAssets.organizationId} and c.project_id=${promptAssets.projectId} and a.depth<100) select string_agg(name, ' / ' order by depth desc) from ancestors), 'Root'))`;
  const columns = {
    name: promptAssets.name,
    key: promptAssets.key,
    categoryId: promptAssets.categoryId,
    latestVersion: promptAssets.latestVersion,
    updatedAt: promptAssets.updatedAt,
  };
  const column = columns[key as keyof typeof columns];
  if (!column)
    throw new TelemetryValidationError("Unknown prompt filter field.");
  return sql`to_jsonb(${column})`;
}
export function promptFilterCondition(raw?: string) {
  let filters: TableFilters;
  try {
    filters = validateTableFilters(
      raw
        ? TableFiltersSchema.parse(JSON.parse(raw))
        : { match: "all", rules: [] },
      PROMPT_TABLE_FILTER_FIELDS,
    );
  } catch {
    throw new TelemetryValidationError("Invalid prompt filters.");
  }
  return jsonFilterCondition(
    filters,
    PROMPT_TABLE_FILTER_FIELDS,
    promptFilterExpression,
  );
}
export async function listPromptFilterValues(
  db: TelemetryDb,
  input: {
    organizationId: string;
    projectId: string;
    field: string;
    search: string;
    archived?: boolean;
    categoryId?: string | null | undefined;
  },
) {
  const expression = promptFilterExpression(input.field);
  const rows = await db.execute(
    sql`select distinct f.value #>> '{}' as value from ${promptAssets} cross join lateral jsonb_array_elements(jsonb_build_array(${expression})) as f(value) where ${promptAssets.organizationId}=${input.organizationId} and ${promptAssets.projectId}=${input.projectId} and ${promptAssets.archived}=${input.archived ?? false} ${input.categoryId === null ? sql`and ${promptAssets.categoryId} is null` : input.categoryId ? sql`and ${promptAssets.categoryId}=${input.categoryId}` : sql``} and f.value <> 'null'::jsonb and length(f.value #>> '{}') between 1 and 512 and f.value #>> '{}' ilike ${`%${literalLike(input.search)}%`} order by value limit 50`,
  );
  return Array.from(rows).map((row) => String(row.value));
}
