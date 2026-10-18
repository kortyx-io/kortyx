import { expect, it } from "vitest";
import {
  applyTablePreferenceOperation,
  emptyTablePreferences,
  StudioTableConfigurationSchema,
  StudioTablePreferenceWriteSchema,
} from "../src/table-preferences";

it("exports a versioned portable configuration without ownership or database revision", () => {
  const { revision: _, ...configuration } = emptyTablePreferences();
  expect(StudioTableConfigurationSchema.parse(configuration)).toEqual({
    schemaVersion: 1,
    defaults: {},
    views: [],
  });
  expect(
    StudioTableConfigurationSchema.safeParse({
      ...configuration,
      userId: "source-user",
    }).success,
  ).toBe(false);
  expect(
    StudioTableConfigurationSchema.safeParse({
      ...configuration,
      schemaVersion: 2,
    }).success,
  ).toBe(false);
});
it("bounds stored configuration and rejects owner fields on writes", () => {
  const input = {
    scopeKey: "a".repeat(64),
    expectedRevision: 0,
    operation: {
      kind: "defaults",
      patch: { query: { sort: "name", dir: "asc", pageSize: 20 } },
    },
  };
  expect(StudioTablePreferenceWriteSchema.safeParse(input).success).toBe(true);
  expect(
    StudioTablePreferenceWriteSchema.safeParse({ ...input, userId: "other" })
      .success,
  ).toBe(false);
  expect(
    StudioTablePreferenceWriteSchema.safeParse({
      ...input,
      operation: {
        kind: "defaults",
        patch: {
          layout: {
            widths: { name: Infinity },
            order: [],
            hidden: [],
            pinned: {},
          },
        },
      },
    }).success,
  ).toBe(false);
});
it("updates views by stable ID and makes retrying an upsert idempotent", () => {
  const view = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "One",
    filters: { match: "all" as const, rules: [] },
    layout: { widths: {}, order: [], hidden: [], pinned: {} },
    scope: {},
  };
  const first = applyTablePreferenceOperation(emptyTablePreferences(), {
    kind: "putView",
    view,
  });
  const retry = applyTablePreferenceOperation(first, { kind: "putView", view });
  expect(retry.views).toHaveLength(1);
  expect(
    applyTablePreferenceOperation(retry, { kind: "deleteView", id: view.id })
      .views,
  ).toEqual([]);
});
