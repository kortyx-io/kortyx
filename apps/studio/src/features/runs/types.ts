export type RunStatus =
  | "running"
  | "completed"
  | "interrupted"
  | "failed"
  | "cancelled";

export type SortKey = "started" | "duration" | "tokens" | "cost" | "status";

export type Run = {
  id: string;
  status: RunStatus;
  started: string;
  startedAt: string;
  workflow: string;
  version: string;
  path: string[];
  session: string;
  model: string;
  models?: number;
  duration: number;
  tokens?: number;
  cost?: number;
  result: string;
  provider: "OpenAI" | "Anthropic" | "Google";
  environment: "Development" | "Staging" | "Production";
  user: string;
  tenant: string;
  hasTool: boolean;
  hasRetry?: boolean;
  interruptNode?: string;
};
