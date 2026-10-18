import {
  STUDIO_TABLE_FIELDS,
  type StudioTableResource,
  type TableFilterValue,
} from "@kortyx/telemetry-contracts";
import type { DataTableFilter } from "@/components/data-table/types";
import { valueColumn } from "@/components/data-table/value-column";

const columnFields: Record<StudioTableResource, Record<string, string[]>> = {
  runs: {
    userId: ["userId"],
    tenantId: ["tenantId"],
    environment: ["environment"],
    id: ["id"],
    endedAt: ["endedAt"],
    pricingStatus: ["pricingStatus"],
    parent: [
      "id",
      "execution",
      "parentRunId",
      "callId",
      "hasTool",
      "toolName",
      "toolOutcome",
      "toolMode",
    ],
    status: ["status"],
    started: ["startedAt"],
    feedback: ["feedback"],
    workflow: ["workflowIds", "versions", "transitionIds"],
    path: ["path"],
    session: ["sessionId"],
    model: ["provider", "models"],
    duration: ["durationMs"],
    tokens: ["tokens"],
    cost: ["cost", "currency"],
    result: ["result"],
  },
  sessions: {
    workflowIds: ["workflowIds"],
    activeVersion: ["activeVersion"],
    providers: ["providers"],
    models: ["models"],
    tags: ["tags"],
    environment: ["environment"],
    userId: ["userId"],
    tenantId: ["tenantId"],
    status: ["status"],
    activity: ["lastActivityAt"],
    session: [
      "id",
      "workflowIds",
      "activeVersion",
      "providers",
      "models",
      "tags",
    ],
    identity: ["userId", "tenantId"],
    runs: ["runs", "succeeded", "failed", "interrupted"],
    checkpoint: [
      "checkpoints",
      "hasFork",
      "pendingInterruptId",
      "hasInterrupt",
      "hasCheckpoint",
    ],
    duration: ["durationMs"],
    tokens: ["tokens"],
    cost: ["cost", "currency"],
    result: ["latestResult", "latestError", "hasError"],
  },
  interrupts: {
    expiresAt: ["expiresAt"],
    resolvedAt: ["resolvedAt"],
    resolvedBy: ["resolvedBy"],
    resolutionMs: ["resolutionMs"],
    environment: ["environment"],
    userId: ["userId"],
    tenantId: ["tenantId"],
    status: ["id", "status"],
    created: ["createdAt"],
    age: ["age", "resolutionMs"],
    request: ["question", "type", "contract", "schemaId"],
    workflow: ["workflowId", "nodeId"],
    session: ["sessionId"],
    identity: ["userId", "tenantId"],
    response: ["response", "resolvedBy"],
    outcome: ["resumeOutcome", "resumeError"],
    run: ["runId"],
  },
};
export function studioColumnFilters<T>(
  resource: StudioTableResource,
  column: string,
): DataTableFilter<T>[] {
  return (columnFields[resource][column] ?? []).map((key) => ({
    ...STUDIO_TABLE_FIELDS[resource].find((field) => field.key === key)!,
    ...(key === "execution"
      ? { options: ["root", "child"] }
      : key === "feedback"
        ? { options: ["positive", "negative", "unrated"] }
        : key === "toolOutcome"
          ? { options: ["success", "denied", "fault", "cancelled", "reused"] }
          : key === "toolMode"
            ? { options: ["direct", "model"] }
            : {}),
    ...(key === "status"
      ? {
          options:
            resource === "interrupts"
              ? ["pending", "resolved", "expired", "failed", "cancelled"]
              : [
                  "running",
                  "completed",
                  "interrupted",
                  "incomplete",
                  "failed",
                  "cancelled",
                ],
        }
      : {}),
    ...(["status", "feedback", "execution"].includes(key)
      ? {
          optionLabels: Object.fromEntries(
            [
              "running",
              "completed",
              "interrupted",
              "incomplete",
              "failed",
              "cancelled",
              "pending",
              "resolved",
              "expired",
              "positive",
              "negative",
              "unrated",
              "root",
              "child",
            ].map((value) => [value, value[0].toUpperCase() + value.slice(1)]),
          ),
        }
      : {}),
    order:
      key === "status"
        ? 0
        : key === "feedback"
          ? 1
          : key === "provider" || key === "providers"
            ? 2
            : key === "workflowIds" || key === "workflowId"
              ? 3
              : 100,
    group:
      key === "status"
        ? "Status"
        : ["hasTool", "toolName", "toolOutcome", "toolMode"].includes(key)
          ? "Tools"
          : ["durationMs", "tokens", "cost", "currency"].includes(key)
            ? "Metrics"
            : "Column values",
    read: (item: T): TableFilterValue | readonly TableFilterValue[] => {
      const row = item as Record<string, unknown>;
      const raw = row.filterValues as
        | Record<string, TableFilterValue | readonly TableFilterValue[]>
        | undefined;
      if (raw && Object.hasOwn(raw, key)) return raw[key];
      const aliases: Record<string, string> = {
        sessionId: "session",
        userId: "user",
        tenantId: "tenant",
        workflowId: "workflow",
        nodeId: "node",
        activeVersion: "version",
      };
      if (key === "activeVersion" && Object.hasOwn(row, "activeVersion"))
        return row.activeVersion as string | null;
      if (key === "cost") {
        const summary = row.costSummary as
          | { amounts: { amount: number }[] }
          | undefined;
        return (
          (row.cost as number | undefined) ??
          (summary?.amounts.length === 1
            ? summary.amounts[0]?.amount
            : undefined)
        );
      }
      if (key === "durationMs")
        return row.duration === undefined
          ? undefined
          : Number(row.duration) * 1000;
      if (key === "execution") return row.parentRunId ? "child" : "root";
      if (key === "versions")
        return (
          (row.workflowRefs as { declaredVersion?: string }[] | undefined)?.map(
            (ref) => ref.declaredVersion ?? "unversioned",
          ) ?? [String(row.version ?? "unversioned")]
        );
      if (key === "workflowIds")
        return (
          (row.workflowIds as string[] | undefined) ?? [
            String(row.workflow ?? ""),
          ]
        );
      if (key === "models" && resource === "runs")
        return (
          (row.modelNames as string[] | undefined) ?? [String(row.model ?? "")]
        );
      if (key === "feedback") {
        const feedback = row.feedback as
          | { positive: number; negative: number }
          | undefined;
        return [
          feedback?.positive ? "positive" : null,
          feedback?.negative ? "negative" : null,
          ...(!feedback?.positive && !feedback?.negative ? ["unrated"] : []),
        ].filter((v): v is string => v !== null);
      }
      if (key === "hasError")
        return Boolean(row.latestError || Number(row.failed) > 0);
      if (key === "hasInterrupt")
        return Boolean(row.pendingInterrupt || Number(row.interrupted) > 0);
      if (key === "hasCheckpoint") return Number(row.checkpoints) > 0;
      if (key === "pendingInterruptId")
        return row.pendingInterrupt as string | undefined;
      if (key === "age")
        return Math.max(
          0,
          (Date.now() - Date.parse(String(row.createdAt))) / 60000,
        );
      if (key === "resolutionMs")
        return row.resolvedAt
          ? Date.parse(String(row.resolvedAt)) -
              Date.parse(String(row.createdAt))
          : undefined;
      return row[aliases[key] ?? key] as
        | TableFilterValue
        | readonly TableFilterValue[];
    },
  }));
}

export function studioValueColumn<T, S extends string = never>(
  resource: StudioTableResource,
  key: string,
  format?: (value: Exclude<TableFilterValue, null | undefined>) => string,
) {
  const filter = studioColumnFilters<T>(resource, key)[0];
  if (!filter) throw new Error(`Missing column filter: ${resource}.${key}`);
  return valueColumn<T, S>({
    key,
    label: filter.label,
    read: filter.read,
    filter,
    ...(format ? { format } : {}),
  });
}
