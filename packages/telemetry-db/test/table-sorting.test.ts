import {
  STUDIO_TABLE_SORT_FIELDS,
  type StudioTableResource,
} from "@kortyx/telemetry-contracts";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";
import { studioSortExpression } from "../src/repositories/table-filters";

it("backs every advertised telemetry sort with a typed SQL expression and rejects arbitrary keys", () => {
  const dialect = new PgDialect();
  for (const resource of Object.keys(
    STUDIO_TABLE_SORT_FIELDS,
  ) as StudioTableResource[]) {
    for (const key of Object.keys(STUDIO_TABLE_SORT_FIELDS[resource])) {
      const expression = studioSortExpression(resource, key);
      expect(expression, `${resource}.${key}`).toBeDefined();
      if (expression) expect(dialect.sqlToQuery(expression).sql).not.toBe("");
    }
    expect(studioSortExpression(resource, "toString")).toBeUndefined();
    expect(
      studioSortExpression(resource, "name desc; drop table studio_runs"),
    ).toBeUndefined();
  }
  expect(
    dialect.sqlToQuery(studioSortExpression("interrupts", "resolutionMs")!).sql,
  ).toContain("::numeric");
  expect(
    dialect.sqlToQuery(studioSortExpression("runs", "endedAt")!).sql,
  ).toContain("::timestamptz");
});
