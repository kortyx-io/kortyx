// biome-ignore-all lint/correctness/useHookAtTopLevel: Kortyx hooks run in server workflow nodes.
import { defineWorkflow, useWorkflow } from "kortyx";
import { z } from "zod";
import {
  companyResearchWorkflow,
  parallelWorkerId,
  roleAnalysisWorkflow,
} from "./parallel-demo.workflow";

const settings = z.object({
  companyId: z.string().min(1).default("Acme"),
  roleId: z.string().min(1).default("Engineer"),
  requireApproval: z.boolean().default(true),
  failCompany: z.boolean().default(false),
  conflict: z.boolean().default(false),
});
// Chat sends text; execute sends an object. JSON text configures the same demo.
const inputSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}, settings);
type Input = z.output<typeof inputSchema>;

export const parallelGraphDemoWorkflow = defineWorkflow({
  id: "parallel-graph-demo",
  version: "1.0.0",
  description:
    "Real graph branches calling children, with independent approvals and a shared join.",
  inputSchema,
  outputSchema: z.object({
    company: z.json(),
    role: z.json(),
    report: z.string(),
    joinedAt: z.number(),
    workerId: z.string(),
  }),
  nodes: {
    company: {
      run: async ({ input }: { input: Input }) => {
        const result = await useWorkflow({
          id: "research",
          workflow: companyResearchWorkflow,
          input: {
            subjectId: input.companyId,
            requireApproval: input.requireApproval,
            fail: input.failCompany,
          },
        });
        return {
          data: {
            company: result.data,
            ...(input.conflict ? { overlapping: "company" } : {}),
          },
        };
      },
    },
    role: {
      run: async ({ input }: { input: Input }) => {
        const result = await useWorkflow({
          id: "research",
          workflow: roleAnalysisWorkflow,
          input: {
            subjectId: input.roleId,
            requireApproval: input.requireApproval,
          },
        });
        return {
          data: {
            role: result.data,
            ...(input.conflict ? { overlapping: "role" } : {}),
          },
        };
      },
    },
    companyContinued: {
      run: async () => ({
        data: { companyContinued: true },
        ui: {
          message:
            "Company branch continued. The role branch may still be waiting.",
        },
      }),
    },
    roleContinued: {
      run: async () => ({
        data: { roleContinued: true },
        ui: { message: "Role branch continued independently." },
      }),
    },
    join: {
      run: async ({
        input,
      }: {
        input: Input & {
          company: { subjectId: string; approved: boolean | null };
          role: { subjectId: string; approved: boolean | null };
        };
      }) => {
        const report = `Joined ${input.company.subjectId} (approved: ${input.company.approved}) and ${input.role.subjectId} (approved: ${input.role.approved}).`;
        return {
          data: { report, joinedAt: Date.now(), workerId: parallelWorkerId },
          ui: { message: report },
        };
      },
    },
  },
  edges: [
    ["__start__", "company"],
    ["__start__", "role"],
    ["company", "companyContinued"],
    ["role", "roleContinued"],
    ["companyContinued", "join"],
    ["roleContinued", "join"],
    ["join", "__end__"],
  ],
});
