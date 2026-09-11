import type {
  PendingRequestRecord,
  PendingRequestStore,
} from "@kortyx/runtime";
import { z } from "zod";
import type { ResumeHandle } from "../execution/types";

const scopeSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
    context: z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      )
      .optional(),
  })
  .strict()
  .refine(
    (scope) =>
      Boolean(
        scope.sessionId ||
          scope.runId ||
          Object.keys(scope.context ?? {}).length,
      ),
    "Interrupt discovery requires an authorized session, run, or context scope.",
  );

export type InterruptScope = z.input<typeof scopeSchema>;
export type ListInterruptsOptions = InterruptScope & {
  status?: "pending";
  afterResponseCompleted?: boolean;
};
export type PendingInterrupt = {
  id: string;
  status: "pending";
  runId: string;
  sessionId: string;
  workflow: string;
  node: string;
  createdAt: string;
  expiresAt: string;
  afterResponseCompleted: boolean;
  input: Omit<PendingRequestRecord["schema"], "meta"> & {
    options: Array<{ id: string; label: string; description?: string }>;
  };
};
export type ResumableInterrupt = PendingInterrupt & { resume: ResumeHandle };

const matches = (record: PendingRequestRecord, scope: InterruptScope) =>
  record.ready !== false &&
  Date.now() < record.createdAt + record.ttlMs &&
  (!scope.sessionId || record.sessionId === scope.sessionId) &&
  (!scope.runId || record.runId === scope.runId) &&
  Object.entries(scope.context ?? {}).every(
    ([key, value]) => record.state?.config.context?.[key] === value,
  );

const summary = (record: PendingRequestRecord): PendingInterrupt => {
  const { meta: _meta, ...input } = record.schema;
  const contract = record.state?.config.executionContract as
    | { id?: string }
    | undefined;
  return {
    id: record.requestId,
    status: "pending",
    runId: record.runId,
    sessionId: record.sessionId ?? "",
    workflow: contract?.id ?? record.workflow,
    node: record.node,
    createdAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.createdAt + record.ttlMs).toISOString(),
    afterResponseCompleted: record.responseCompleted === true,
    input: {
      ...input,
      options: record.options.map(({ id, label, description }) => ({
        id,
        label,
        ...(description !== undefined ? { description } : {}),
      })),
    },
  };
};

export function createInterruptDiscovery(store: PendingRequestStore) {
  const records = () => {
    if (!store.list)
      throw new Error(
        "This persistence adapter does not support interrupt discovery; implement pendingRequests.list.",
      );
    return store.list();
  };
  return {
    async listInterrupts(
      options: ListInterruptsOptions,
    ): Promise<PendingInterrupt[]> {
      const {
        status: _status,
        afterResponseCompleted,
        ...scope
      } = z
        .object({
          sessionId: z.string().optional(),
          runId: z.string().optional(),
          context: z
            .record(
              z.string(),
              z.union([z.string(), z.number(), z.boolean(), z.null()]),
            )
            .optional(),
          status: z.literal("pending").optional(),
          afterResponseCompleted: z.boolean().optional(),
        })
        .strict()
        .parse(options);
      scopeSchema.parse(scope);
      return (await records())
        .filter(
          (record) =>
            matches(record, scope) &&
            (afterResponseCompleted === undefined ||
              (record.responseCompleted === true) === afterResponseCompleted),
        )
        .sort(
          (a, b) =>
            a.createdAt - b.createdAt || a.requestId.localeCompare(b.requestId),
        )
        .map(summary);
    },
    async getInterrupt(
      id: string,
      scope: InterruptScope,
    ): Promise<ResumableInterrupt | null> {
      z.string().min(1).parse(id);
      scopeSchema.parse(scope);
      const record = (await records()).find(
        (record) => record.requestId === id && matches(record, scope),
      );
      if (!record) return null;
      return {
        ...summary(record),
        resume: {
          token: record.token,
          requestId: record.requestId,
          sessionId: record.sessionId ?? "",
          runId: record.runId,
        },
      };
    },
  };
}
