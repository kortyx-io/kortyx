import {
  type Session,
  SessionSchema,
  type SessionStatus,
} from "@/features/sessions/schema";

const workflows = [
  ["customer-support", "v3"],
  ["research-assistant", "v12"],
  ["onboarding-agent", "v8"],
  ["document-intake", "v5"],
  ["lead-qualification", "v17"],
] as const;
const users = ["usr_ada", "usr_liam", "usr_maya", undefined] as const;
const tenants = ["acme", "northstar", "globex", undefined] as const;
const statuses: SessionStatus[] = [
  "running",
  "failed",
  "interrupted",
  "completed",
  "cancelled",
];
const results = [
  "Generating response for the customer request…",
  "Tool timeout: web_search exceeded 30s",
  "Awaiting approval for account merge",
  "Resolved account update request",
  "Session closed by user",
];

export async function getMockSessions(): Promise<Session[]> {
  const now = Date.now();
  return SessionSchema.array().parse(
    Array.from({ length: 38 }, (_, index) => {
      const workflow = workflows[index % workflows.length];
      const status = statuses[index % statuses.length];
      const failed =
        status === "failed" ? 1 + (index % 2) : index % 8 === 0 ? 1 : 0;
      const interrupted =
        status === "interrupted" ? 1 : index % 11 === 0 ? 1 : 0;
      const telemetryMissing = index % 9 === 0;
      return {
        id: `ses_${(0x7d2b8f77 + index * 92821).toString(16)}${index.toString().padStart(2, "0")}`,
        status,
        lastActivityAt: new Date(now - (index * 7 + 1) * 60_000).toISOString(),
        workflow: workflow[0],
        workflowCount: index % 6 === 0 ? 2 : 1,
        version: workflow[1],
        user: users[index % users.length],
        tenant: tenants[index % tenants.length],
        runs: 1 + (index % 9),
        succeeded: Math.max(0, 1 + (index % 9) - failed - interrupted),
        failed,
        interrupted,
        checkpoints: index % 5 === 0 ? undefined : index % 4,
        hasFork: index % 7 === 0,
        duration: telemetryMissing ? undefined : 9 + index * 4,
        tokens: telemetryMissing ? undefined : 1_800 + index * 563,
        cost: telemetryMissing
          ? undefined
          : Number((0.008 + index * 0.0063).toFixed(3)),
        latestResult: results[index % results.length],
        latestError: status === "failed" ? results[1] : undefined,
        pendingInterrupt: status === "interrupted" ? results[2] : undefined,
        providers:
          index % 3 === 0
            ? ["OpenAI", "Anthropic"]
            : [index % 3 === 1 ? "Anthropic" : "Google"],
        models:
          index % 3 === 0
            ? ["gpt-4.1", "claude-sonnet-4"]
            : [index % 3 === 1 ? "claude-haiku-3.5" : "gemini-2.5-pro"],
        tags: index % 2 === 0 ? ["production", "priority"] : ["support"],
        environment:
          index % 3 === 0
            ? "Production"
            : index % 3 === 1
              ? "Staging"
              : "Development",
      };
    }),
  );
}
