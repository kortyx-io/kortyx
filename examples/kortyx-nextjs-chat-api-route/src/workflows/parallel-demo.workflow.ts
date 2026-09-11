// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run in server workflow nodes.
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import {
  defineWorkflow,
  parallel,
  useAbortSignal,
  useInterrupt,
  useWorkflow,
} from "kortyx";
import { z } from "zod";

// Exposes which server performed the work so the restart demo can prove reuse.
export const parallelWorkerId = randomUUID();

const researchInput = z.object({
  subjectId: z.string().min(1),
  requireApproval: z.boolean(),
  fail: z.boolean().default(false),
});
const researchOutput = z.object({
  subjectId: z.string(),
  operationId: z.string(),
  workerId: z.string(),
  startedAt: z.number(),
  finishedAt: z.number(),
  approved: z.boolean().nullable(),
});

function researchWorkflow(id: string, delayMs: number) {
  return defineWorkflow({
    id,
    version: "1.0.0",
    inputSchema: researchInput,
    outputSchema: researchOutput,
    nodes: {
      research: {
        run: async ({ input }: { input: z.output<typeof researchInput> }) => {
          const startedAt = Date.now();
          await setTimeout(delayMs, undefined, { signal: useAbortSignal() });
          return {
            data: {
              subjectId: input.subjectId,
              operationId: randomUUID(),
              workerId: parallelWorkerId,
              startedAt,
              finishedAt: Date.now(),
            },
          };
        },
      },
      review: {
        run: async ({ input }: { input: z.output<typeof researchInput> }) => {
          if (input.fail)
            throw new Error(`Research failed for ${input.subjectId}`);
          const answer = input.requireApproval
            ? await useInterrupt({
                id: "approval",
                request: {
                  kind: "choice",
                  question: `Approve ${input.subjectId}?`,
                  options: [
                    { id: "approve", label: "Approve" },
                    { id: "decline", label: "Decline" },
                  ],
                },
              })
            : null;
          return {
            data: { approved: answer === null ? null : answer === "approve" },
          };
        },
      },
    },
    edges: [
      ["__start__", "research"],
      ["research", "review"],
      ["review", "__end__"],
    ],
  });
}

export const companyResearchWorkflow = researchWorkflow(
  "parallel-company-research",
  600,
);
export const roleAnalysisWorkflow = researchWorkflow(
  "parallel-role-analysis",
  300,
);

const inputSchema = z.object({
  companyId: z.string().min(1),
  roleId: z.string().min(1),
  requireApproval: z.boolean().default(false),
  failRole: z.boolean().default(false),
});

export const parallelDemoWorkflow = defineWorkflow({
  id: "parallel-demo",
  version: "1.0.0",
  description:
    "Independent company and role research, with durable child approvals and shared limits.",
  inputSchema,
  outputSchema: z.object({
    company: researchOutput,
    role: researchOutput,
    joinedAt: z.number(),
    workerId: z.string(),
  }),
  nodes: {
    research: {
      run: async ({ input }: { input: z.output<typeof inputSchema> }) => {
        const [company, role] = await parallel([
          useWorkflow({
            id: "company",
            workflow: companyResearchWorkflow,
            input: {
              subjectId: input.companyId,
              requireApproval: input.requireApproval,
            },
          }),
          useWorkflow({
            id: "role",
            workflow: roleAnalysisWorkflow,
            input: {
              subjectId: input.roleId,
              requireApproval: input.requireApproval,
              fail: input.failRole,
            },
          }),
        ]);
        return {
          data: {
            company: company.data,
            role: role.data,
            joinedAt: Date.now(),
            workerId: parallelWorkerId,
          },
        };
      },
    },
  },
  edges: [
    ["__start__", "research"],
    ["research", "__end__"],
  ],
});
