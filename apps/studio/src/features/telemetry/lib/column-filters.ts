import {
  STUDIO_TABLE_FIELDS,
  type StudioTableResource,
  type TableFilterValue,
} from "@kortyx/telemetry-contracts";
import type { DataTableFilter } from "@/components/data-table/types";

const columnFields: Record<StudioTableResource, Record<string, string[]>> = {
  runs: {
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
